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

// IMPROVED: Better default confidence and reduced overlap for better detection
const CONFIDENCE = parseFloat(process.env.ROBOFLOW_CONFIDENCE || "0.4");
const OVERLAP = parseFloat(process.env.ROBOFLOW_OVERLAP || "0.3");

// IMPROVED: Process every 2nd frame to reduce API calls while maintaining responsiveness
const FRAME_SAMPLE_RATE = parseInt(process.env.FRAME_SAMPLE_RATE || "2");

// IMPROVED: Frame queue for non-blocking processing
const MAX_QUEUE_SIZE = 3;
let processingQueue = [];
let isProcessingFrame = false;

let ffmpegProcess = null;
let isProcessingVideo = false;
let frameCount = 0;

let webcamProcess = null;
let isProcessingWebcam = false;
let webcamFrameCount = 0;
let webcamClients = new Set();

// IMPROVED: Add frame dimension tracking
let frameWidth = 640;
let frameHeight = 480;

/* ---------------- SERVER ---------------- */

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║      🛡️  ROBOFLOW PPE DETECTION BACKEND (IMPROVED)           ║
╚══════════════════════════════════════════════════════════════╝
🚀 http://127.0.0.1:${PORT}
📹 Video: ${VIDEO_FILE}
🎯 Model: ${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}
⚡ Confidence: ${CONFIDENCE} | Overlap: ${OVERLAP}
🔄 Frame Sample Rate: 1/${FRAME_SAMPLE_RATE}
`);
});

/* ---------------- WEBSOCKETS ---------------- */

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", ws => {
  clients.add(ws);
  console.log(`✅ WebSocket client connected. Total: ${clients.size}`);
  
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`❌ WebSocket client disconnected. Total: ${clients.size}`);
  });
  
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  let successCount = 0;
  
  clients.forEach(ws => {
    if (ws.readyState === 1) {
      try {
        ws.send(message);
        successCount++;
      } catch (error) {
        console.error("Error broadcasting to client:", error);
      }
    }
  });
  
  return successCount;
}

/* ---------------- HEALTH ---------------- */

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    videoExists: fs.existsSync(VIDEO_FILE),
    isProcessing: isProcessingVideo,
    isProcessingWebcam: isProcessingWebcam,
    clients: clients.size,
    queueSize: processingQueue.length,
    frameWidth,
    frameHeight
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
    console.log(`🔑 API Key: ${ROBOFLOW_API_KEY?.substring(0, 8)}...`);
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
        frameSize: imageBuffer.length,
        imageInfo: response.data.image || {}
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
  processingQueue = [];

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
    console.log("📹 Video processing completed");
  });

  res.json({ success: true });
});

/* ---------------- STOP PROCESSING ---------------- */

app.post("/api/stop-processing", (_, res) => {
  isProcessingVideo = false;
  ffmpegProcess?.kill("SIGTERM");
  ffmpegProcess = null;
  processingQueue = [];
  res.json({ success: true });
});

/* ---------------- STATUS & STATS ENDPOINTS ---------------- */

app.get("/api/status", (_, res) => {
  res.json({
    isProcessing: isProcessingVideo,
    isProcessingWebcam: isProcessingWebcam,
    frameCount: frameCount,
    webcamFrameCount: webcamFrameCount,
    clients: clients.size,
    queueSize: processingQueue.length
  });
});

app.get("/stats", (_, res) => {
  res.json({
    status: "ok",
    isProcessing: isProcessingVideo,
    isProcessingWebcam: isProcessingWebcam,
    frameCount: frameCount,
    webcamFrameCount: webcamFrameCount,
    clients: clients.size,
    videoExists: fs.existsSync(VIDEO_FILE),
    queueSize: processingQueue.length
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
    try {
      res.write("--boundary\r\n");
      res.write("Content-Type: image/jpeg\r\n");
      res.write(`Content-Length: ${frame.length}\r\n`);
      res.write("Content-Disposition: inline; filename=frame.jpg\r\n\r\n");
      res.write(frame);
      res.write("\r\n");
    } catch (e) {
      // Client disconnected
    }
  };

  webcamClients2.add(frameHandler);
  
  req.on("close", () => {
    webcamClients2.delete(frameHandler);
    console.log("🎥 Webcam client disconnected");
  });
});

function broadcastWebcamFrame(frame) {
  const toRemove = [];
  
  webcamClients2.forEach(handler => {
    try {
      handler(frame);
    } catch (e) {
      toRemove.push(handler);
    }
  });
  
  toRemove.forEach(handler => webcamClients2.delete(handler));
}

/* --------------- START WEBCAM PROCESSING WITH PPE DETECTION --------------- */

app.post("/api/start-webcam-processing", (_, res) => {
  if (isProcessingWebcam) {
    return res.status(400).json({ error: "Webcam processing already running" });
  }

  isProcessingWebcam = true;
  webcamFrameCount = 0;
  processingQueue = [];

  console.log("\n🎥 Starting webcam PPE detection...");
  console.log(`⚙️  Settings: Confidence=${CONFIDENCE}, Overlap=${OVERLAP}, SampleRate=1/${FRAME_SAMPLE_RATE}`);

  // IMPROVED: Better webcam settings for higher quality
  webcamProcess = spawn("ffmpeg", [
    "-f", "v4l2",
    "-video_size", "640x480",
    "-framerate", "30",  // Increased from 15
    "-i", "/dev/video0",
    "-vf", "fps=5",  // Extract 5 frames per second (increased from 1)
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-q:v", "2",  // High quality JPEG
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
      
      // IMPROVED: Process with queue to avoid blocking
      if (webcamFrameCount % FRAME_SAMPLE_RATE === 0) {
        queueFrameProcessing(frame, webcamFrameCount, 'webcam');
      }
    }
  });

  webcamProcess.stderr.on("data", (data) => {
    const message = data.toString();
    
    // Check for device busy error
    if (message.includes("Device or resource busy")) {
      errorOccurred = true;
      console.error("❌ Webcam device is busy. Another process is using /dev/video0");
      console.error("   Fix: pkill -f 'ffmpeg.*video0' || fuser -k /dev/video0");
      
      broadcast({
        eventType: "WEBCAM_ERROR",
        error: "Device busy - another process is using /dev/video0",
        message: "Try: pkill -f 'ffmpeg.*video0' or fuser -k /dev/video0"
      });
      
      isProcessingWebcam = false;
      webcamProcess?.kill("SIGTERM");
      return;
    }
    
    // Ignore common FFmpeg info messages
    if (message.includes("frame=") || message.includes("fps=") || message.includes("bitrate=")) {
      return;
    }
    
    if (message.includes("error") || message.includes("Error")) {
      console.error("❌ FFmpeg error:", message);
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
  processingQueue = [];
  console.log("🎥 Webcam processing stopped");
  res.json({ success: true, message: "Webcam processing stopped" });
});

/* --------------- IMPROVED: FRAME QUEUE PROCESSING --------------- */

function queueFrameProcessing(imageBuffer, frameNumber, source = 'webcam') {
  // Don't queue if we're already at max capacity
  if (processingQueue.length >= MAX_QUEUE_SIZE) {
    console.log(`⚠️  Queue full, skipping frame #${frameNumber}`);
    return;
  }
  
  processingQueue.push({ imageBuffer, frameNumber, source });
  
  if (!isProcessingFrame) {
    processNextFrame();
  }
}

async function processNextFrame() {
  if (processingQueue.length === 0) {
    isProcessingFrame = false;
    return;
  }
  
  isProcessingFrame = true;
  const { imageBuffer, frameNumber, source } = processingQueue.shift();
  
  try {
    if (source === 'webcam') {
      await processWebcamFrame(imageBuffer, frameNumber);
    } else {
      await processFrame(imageBuffer, frameNumber);
    }
  } catch (error) {
    console.error(`❌ Error processing frame #${frameNumber}:`, error.message);
  }
  
  // Process next frame
  setImmediate(processNextFrame);
}

/* --------------- IMPROVED: WEBCAM ROBOFLOW INFERENCE --------------- */

async function processWebcamFrame(imageBuffer, frameNumber) {
  try {
    const form = new FormData();
    form.append("file", imageBuffer, {
      filename: "webcam-frame.jpg",
      contentType: "image/jpeg"
    });

    const url = `http://localhost:9001/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`;
    
    const response = await axios.post(
      url,
      form,
      {
        params: {
          api_key: ROBOFLOW_API_KEY,
          confidence: CONFIDENCE,
          overlap: OVERLAP,
          // IMPROVED: Request image dimensions from Roboflow
          image_info: true
        },
        headers: {
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 10000  // Reduced timeout for faster response
      }
    );

    const predictions = response.data.predictions || [];
    
    // IMPROVED: Track frame dimensions from Roboflow response
    if (response.data.image) {
      frameWidth = response.data.image.width || 640;
      frameHeight = response.data.image.height || 480;
    }
    
    console.log(`✅ Frame #${frameNumber}: ${predictions.length} detections (${frameWidth}x${frameHeight})`);

    // IMPROVED: Send all predictions in a single message with frame dimensions
    if (predictions.length > 0) {
      broadcast({
        eventType: "PPE_DETECTION_BATCH_WEBCAM",
        source: "webcam",
        frame: frameNumber,
        frameWidth: frameWidth,
        frameHeight: frameHeight,
        count: predictions.length,
        predictions: predictions.map(p => ({
          type: p.class,
          confidence: p.confidence,
          boundingBox: {
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height
          }
        })),
        timestamp: new Date().toISOString()
      });
      
      // Also send individual events for compatibility
      predictions.forEach((p, i) => {
        broadcast({
          eventType: "PPE_DETECTION_WEBCAM",
          source: "webcam",
          frame: frameNumber,
          frameWidth: frameWidth,
          frameHeight: frameHeight,
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
    }

  } catch (e) {
    console.error(`❌ Frame #${frameNumber} Error:`, {
      status: e.response?.status,
      statusText: e.response?.statusText,
      message: e.message
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

    const response = await axios.post(
      url,
      form,
      {
        params: {
          api_key: ROBOFLOW_API_KEY,
          confidence: CONFIDENCE,
          overlap: OVERLAP,
          image_info: true
        },
        headers: {
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 10000
      }
    );

    const predictions = response.data.predictions || [];
    
    if (response.data.image) {
      frameWidth = response.data.image.width || 640;
      frameHeight = response.data.image.height || 480;
    }
    
    console.log(`✅ Frame #${frameNumber}: ${predictions.length} detections`);

    predictions.forEach((p, i) => {
      broadcast({
        eventType: "PPE_DETECTION",
        frame: frameNumber,
        frameWidth: frameWidth,
        frameHeight: frameHeight,
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
      message: e.message
    });
  }
}

/* ---------------- SHUTDOWN ---------------- */

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("\n🛑 Shutting down...");
  isProcessingVideo = false;
  isProcessingWebcam = false;
  ffmpegProcess?.kill("SIGTERM");
  webcamProcess?.kill("SIGTERM");
  processingQueue = [];
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
}

export default app;