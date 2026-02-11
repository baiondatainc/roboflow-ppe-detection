import express from "express";
import { WebSocketServer } from "ws";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import dotenv from "dotenv";
import { spawn } from "child_process";
import FormData from "form-data";

dotenv.config();

/* ---------------- BASIC SETUP ---------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const VIDEO_FILE = process.env.VIDEO_FILE || "./ppe-upload-video-new1.mp4";

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL;
const ROBOFLOW_VERSION = process.env.ROBOFLOW_VERSION;

const CONFIDENCE = parseFloat(process.env.ROBOFLOW_CONFIDENCE || "0.5");
const OVERLAP = parseFloat(process.env.ROBOFLOW_OVERLAP || "0.5");
const FRAME_SAMPLE_RATE = parseInt(process.env.FRAME_SAMPLE_RATE || "1");

let ffmpegProcess = null;
let isProcessingVideo = false;
let frameCount = 0;

let webcamProcess = null;
let isProcessingWebcam = false;
let webcamFrameCount = 0;
let webcamClients = new Set();

/* ---------------- SERVER ---------------- */

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║      🛡️  ROBOFLOW PPE DETECTION BACKEND (READY)              ║
╚══════════════════════════════════════════════════════════════╝
🚀 http://127.0.0.1:${PORT}
📹 Video: ${VIDEO_FILE}
🎯 Model: ${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}
`);
});

/* ---------------- WEBSOCKETS ---------------- */

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", ws => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(data) {
  clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  });
}

/* ---------------- HEALTH ---------------- */

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    videoExists: fs.existsSync(VIDEO_FILE),
    isProcessing: isProcessingVideo,
    clients: clients.size
  });
});

/* ---------------- DEBUG: TEST ROBOFLOW ---------------- */

app.post("/debug/test-roboflow", async (_, res) => {
  if (!fs.existsSync(VIDEO_FILE)) {
    return res.status(400).json({ error: "Video not found" });
  }

  const ffmpeg = spawn("ffmpeg", [
    "-ss", "00:00:01",
    "-i", VIDEO_FILE,
    "-frames:v", "1",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-q:v", "2",
    "-"
  ]);

  let imageBuffer = Buffer.alloc(0);

  ffmpeg.stdout.on("data", chunk => {
    imageBuffer = Buffer.concat([imageBuffer, chunk]);
  });

  ffmpeg.on("close", async () => {
    console.log("\n🧪 TEST ENDPOINT - Roboflow API Debug");
    console.log("=" .repeat(60));
    console.log(`📸 Frame Size: ${imageBuffer.length} bytes`);
    console.log(`🔑 API Key: ${ROBOFLOW_API_KEY}`);
    console.log(`📊 Model: ${ROBOFLOW_MODEL}`);
    console.log(`📌 Version: ${ROBOFLOW_VERSION}`);
    console.log(`🎯 Confidence: ${CONFIDENCE}`);
    console.log(`📐 Overlap: ${OVERLAP}`);
    
    const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`;
    console.log(`🌐 URL: ${url}`);
    console.log("=" .repeat(60));

    try {
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: "frame.jpg",
        contentType: "image/jpeg"
      });

      console.log("\n📤 Sending POST request...");
      const response = await axios.post(
        url,
        form,
        {
          params: {
            api_key: ROBOFLOW_API_KEY,
            confidence: CONFIDENCE,
            overlap: OVERLAP
          },
          headers: {
            ...form.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 30000
        }
      );

      console.log("✅ API Response received!");
      console.log("Status:", response.status);
      console.log("Data:", JSON.stringify(response.data, null, 2));
      
      res.json({
        success: true,
        message: "Roboflow API test successful",
        predictions: response.data.predictions || [],
        frameSize: imageBuffer.length
      });
    } catch (error) {
      console.error("❌ API Error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data || error.message,
        url: url
      });
    }
  });
});

/* ---------------- START PROCESSING ---------------- */

app.post("/api/start-processing", (_, res) => {
  if (isProcessingVideo) {
    return res.status(400).json({ error: "Already running" });
  }

  if (!fs.existsSync(VIDEO_FILE)) {
    return res.status(400).json({ error: "Video not found" });
  }

  isProcessingVideo = true;
  frameCount = 0;

  ffmpegProcess = spawn("ffmpeg", [
    "-i", VIDEO_FILE,
    "-vf", "fps=1",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-q:v", "2",
    "-"
  ]);

  let buffer = Buffer.alloc(0);

  ffmpegProcess.stdout.on("data", async chunk => {
    buffer = Buffer.concat([buffer, chunk]);

    // memory guard
    if (buffer.length > 5 * 1024 * 1024) {
      buffer = Buffer.alloc(0);
      return;
    }

    const endMarker = Buffer.from([0xff, 0xd9]);
    let idx;

    while ((idx = buffer.indexOf(endMarker)) !== -1) {
      const frame = buffer.slice(0, idx + 2);
      buffer = buffer.slice(idx + 2);

      frameCount++;
      if (frameCount % FRAME_SAMPLE_RATE === 0) {
        await processFrame(frame, frameCount);
      }
    }
  });

  ffmpegProcess.on("close", () => {
    isProcessingVideo = false;
  });

  res.json({ success: true });
});

/* ---------------- STOP PROCESSING ---------------- */

app.post("/api/stop-processing", (_, res) => {
  isProcessingVideo = false;
  ffmpegProcess?.kill("SIGTERM");
  ffmpegProcess = null;
  res.json({ success: true });
});

/* ---------------- STATUS & STATS ENDPOINTS ---------------- */

app.get("/api/status", (_, res) => {
  res.json({
    isProcessing: isProcessingVideo,
    frameCount: frameCount,
    clients: clients.size
  });
});

app.get("/stats", (_, res) => {
  res.json({
    status: "ok",
    isProcessing: isProcessingVideo,
    frameCount: frameCount,
    clients: clients.size,
    videoExists: fs.existsSync(VIDEO_FILE)
  });
});

/* ---------------- VIDEO STREAMING ENDPOINT ---------------- */

app.get("/video", (req, res) => {
  if (!fs.existsSync(VIDEO_FILE)) {
    return res.status(404).json({ error: "Video not found" });
  }

  const videoStats = fs.statSync(VIDEO_FILE);
  const videoSize = videoStats.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${videoSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": "video/mp4"
    });

    fs.createReadStream(VIDEO_FILE, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": videoSize,
      "Content-Type": "video/mp4"
    });

    fs.createReadStream(VIDEO_FILE).pipe(res);
  }
});

/* ---------------- WEBCAM STREAMING ENDPOINT (MJPEG) ---------------- */

let webcamBuffer = Buffer.alloc(0);
const webcamClients2 = new Set();

app.get("/webcam", (req, res) => {
  console.log("🎥 Webcam stream requested");
  
  // Set MJPEG headers
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=--boundary",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache"
  });

  const frameHandler = (frame) => {
    res.write("--boundary\r\n");
    res.write("Content-Type: image/jpeg\r\n");
    res.write(`Content-Length: ${frame.length}\r\n`);
    res.write("Content-Disposition: inline; filename=frame.jpg\r\n\r\n");
    res.write(frame);
    res.write("\r\n");
  };

  webcamClients2.add(frameHandler);
  
  req.on("close", () => {
    webcamClients2.delete(frameHandler);
    console.log("🎥 Webcam client disconnected");
  });
});

function broadcastWebcamFrame(frame) {
  webcamClients2.forEach(handler => {
    try {
      handler(frame);
    } catch (e) {
      console.error("❌ Error broadcasting webcam frame:", e.message);
    }
  });
}

/* --------------- START WEBCAM PROCESSING WITH PPE DETECTION --------------- */

app.post("/api/start-webcam-processing", (_, res) => {
  if (isProcessingWebcam) {
    return res.status(400).json({ error: "Webcam processing already running" });
  }

  isProcessingWebcam = true;
  webcamFrameCount = 0;

  console.log("\n🎥 Starting webcam PPE detection...");

  // Capture from /dev/video0 (default webcam device)
  webcamProcess = spawn("ffmpeg", [
    "-f", "v4l2",
    "-video_size", "640x480",
    "-framerate", "15",
    "-i", "/dev/video0",
    "-vf", "fps=1",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-q:v", "2",
    "-"
  ]);

  let buffer = Buffer.alloc(0);
  let errorOccurred = false;

  webcamProcess.stdout.on("data", async chunk => {
    if (errorOccurred) return;
    
    buffer = Buffer.concat([buffer, chunk]);

    // Memory guard
    if (buffer.length > 5 * 1024 * 1024) {
      buffer = Buffer.alloc(0);
      return;
    }

    const endMarker = Buffer.from([0xff, 0xd9]);
    let idx;

    while ((idx = buffer.indexOf(endMarker)) !== -1) {
      const frame = buffer.slice(0, idx + 2);
      buffer = buffer.slice(idx + 2);

      webcamFrameCount++;
      
      // Broadcast frame to all connected MJPEG clients
      broadcastWebcamFrame(frame);
      
      // Process every frame for detection
      await processWebcamFrame(frame, webcamFrameCount);
    }
  });

  webcamProcess.stderr.on("data", (data) => {
    const message = data.toString();
    
    // Check for device busy error
    if (message.includes("Device or resource busy")) {
      errorOccurred = true;
      console.error("❌ Webcam device is busy. Another process is using /dev/video0");
      console.error("   Fix: pkill -f 'ffmpeg.*video0' || fuser -k /dev/video0");
      
      // Broadcast error to UI
      broadcast({
        eventType: "WEBCAM_ERROR",
        error: "Device busy - another process is using /dev/video0",
        message: "Try: pkill -f 'ffmpeg.*video0' or fuser -k /dev/video0"
      });
      
      isProcessingWebcam = false;
      webcamProcess?.kill("SIGTERM");
      return;
    }
    
    if (message.includes("error") || message.includes("Error")) {
      errorOccurred = true;
      console.error("❌ FFmpeg error:", message);
      
      broadcast({
        eventType: "WEBCAM_ERROR",
        error: "FFmpeg error",
        message: message
      });
    }
  });

  webcamProcess.on("close", () => {
    console.log("🎥 Webcam process closed");
    isProcessingWebcam = false;
  });

  webcamProcess.on("error", (error) => {
    errorOccurred = true;
    console.error("❌ Webcam process error:", error.message);
    
    broadcast({
      eventType: "WEBCAM_ERROR",
      error: "Process error",
      message: error.message
    });
    
    isProcessingWebcam = false;
  });

  res.json({ success: true, message: "Webcam PPE detection started" });
});

/* --------------- STOP WEBCAM PROCESSING --------------- */

app.post("/api/stop-webcam-processing", (_, res) => {
  isProcessingWebcam = false;
  webcamProcess?.kill("SIGTERM");
  webcamProcess = null;
  console.log("🎥 Webcam processing stopped");
  res.json({ success: true, message: "Webcam processing stopped" });
});

/* --------------- WEBCAM ROBOFLOW INFERENCE --------------- */

async function processWebcamFrame(imageBuffer, frameNumber) {
  try {
    const form = new FormData();
    form.append("file", imageBuffer, {
      filename: "webcam-frame.jpg",
      contentType: "image/jpeg"
    });

    const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`;
    
    console.log(`\n🎥 Webcam Frame #${frameNumber} | Size: ${imageBuffer.length} bytes`);
    console.log(`🌐 Calling: ${url}`);

    const response = await axios.post(
      url,
      form,
      {
        params: {
          api_key: ROBOFLOW_API_KEY,
          confidence: CONFIDENCE,
          overlap: OVERLAP
        },
        headers: {
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000
      }
    );

    const predictions = response.data.predictions || [];
    console.log(`✅ Got ${predictions.length} predictions`);

    predictions.forEach((p, i) => {
      console.log(`   [${i+1}] ${p.class} @ ${(p.confidence * 100).toFixed(1)}% (${p.x}, ${p.y}, ${p.width}, ${p.height})`);
      
      broadcast({
        eventType: "PPE_DETECTION_WEBCAM",
        source: "webcam",
        frame: frameNumber,
        type: p.class,
        confidence: p.confidence,
        boundingBox: {
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height
        },
        timestamp: new Date().toISOString()
      });
    });

  } catch (e) {
    console.error(`❌ Webcam Frame #${frameNumber} Error:`, {
      status: e.response?.status,
      statusText: e.response?.statusText,
      message: e.message,
      data: e.response?.data
    });
  }
}

/* --------------- ROBOFLOW INFERENCE --------------- */

async function processFrame(imageBuffer, frameNumber) {
  try {
    const form = new FormData();
    form.append("file", imageBuffer, {
      filename: "frame.jpg",
      contentType: "image/jpeg"
    });

    const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`;
    
    console.log(`\n📹 Frame #${frameNumber} | Size: ${imageBuffer.length} bytes`);
    console.log(`🌐 Calling: ${url}`);

    const response = await axios.post(
      url,
      form,
      {
        params: {
          api_key: ROBOFLOW_API_KEY,
          confidence: CONFIDENCE,
          overlap: OVERLAP
        },
        headers: {
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000
      }
    );

    const predictions = response.data.predictions || [];
    console.log(`✅ Got ${predictions.length} predictions`);

    predictions.forEach((p, i) => {
      console.log(`   [${i+1}] ${p.class} @ ${(p.confidence * 100).toFixed(1)}% (${p.x}, ${p.y}, ${p.width}, ${p.height})`);
      
      broadcast({
        eventType: "PPE_DETECTION",
        frame: frameNumber,
        type: p.class,
        confidence: p.confidence,
        boundingBox: {
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height
        },
        timestamp: new Date().toISOString()
      });
    });

  } catch (e) {
    console.error(`❌ Frame #${frameNumber} Error:`, {
      status: e.response?.status,
      statusText: e.response?.statusText,
      message: e.message,
      data: e.response?.data
    });
  }
}

/* ---------------- SHUTDOWN ---------------- */

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  isProcessingVideo = false;
  ffmpegProcess?.kill("SIGTERM");
  server.close(() => process.exit(0));
}

export default app;
