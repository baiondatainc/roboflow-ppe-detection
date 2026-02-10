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

// Add CSP headers to allow inline scripts and eval
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' ws: wss:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: ws: wss: http://localhost:*;"
  );
  next();
});

const PORT = process.env.PORT || 3001;
const VIDEO_FILE = process.env.VIDEO_FILE || "./ppe-upload-video-new1.mp4";
const USE_CAMERA = process.env.USE_CAMERA === "true" || false;
const CAMERA_DEVICE = process.env.CAMERA_DEVICE || "/dev/video0";

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL;
const ROBOFLOW_VERSION = process.env.ROBOFLOW_VERSION;

const CONFIDENCE = parseFloat(process.env.ROBOFLOW_CONFIDENCE || "0.5");
const OVERLAP = parseFloat(process.env.ROBOFLOW_OVERLAP || "0.5");
const FRAME_SAMPLE_RATE = parseInt(process.env.FRAME_SAMPLE_RATE || "1");

let ffmpegProcess = null;
let isProcessingVideo = false;
let frameCount = 0;

/* ---------------- SERVER ---------------- */

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║      🛡️  ROBOFLOW PPE DETECTION BACKEND (READY)              ║
╚══════════════════════════════════════════════════════════════╝
🚀 http://127.0.0.1:${PORT}
📹 Source: ${USE_CAMERA ? "📷 Camera " + CAMERA_DEVICE : "🎬 Video File: " + VIDEO_FILE}
🎯 Model: ${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}
🔍 Detection: Helmets & Gloves
`);

  // Auto-start processing if enabled
  const AUTO_START = process.env.AUTO_START_PROCESSING === "true";
  if (AUTO_START) {
    setTimeout(() => {
      console.log("\n⚙️  AUTO_START enabled - starting processing...");
      startProcessingInternal();
    }, 1000);
  }
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
    console.log(`🔑 API Key: ${ROBOFLOW_API_KEY ? "***" + ROBOFLOW_API_KEY.slice(-4) : "NOT SET"}`);
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
        modelUsed: url,
        predictionCount: (response.data.predictions || []).length
      });
    } catch (error) {
      console.error("❌ API Error Details:");
      console.error("  Status:", error.response?.status);
      console.error("  Status Text:", error.response?.statusText);
      console.error("  Error Data:", error.response?.data);
      console.error("  Message:", error.message);
      
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data || error.message,
        url: url,
        hint: error.response?.status === 401 ? "Invalid API key or no access to model" : 
              error.response?.status === 404 ? "Model not found - check model path" :
              "Check API key and model configuration"
      });
    }
  });
});

/* ---------------- DEBUG: VERIFY API CONFIGURATION ---------------- */

app.get("/debug/config", (_, res) => {
  res.json({
    apiKeySet: !!ROBOFLOW_API_KEY,
    apiKeyPreview: ROBOFLOW_API_KEY ? "***" + ROBOFLOW_API_KEY.slice(-4) : "NOT SET",
    model: ROBOFLOW_MODEL,
    version: ROBOFLOW_VERSION,
    modelUrl: `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`,
    confidence: CONFIDENCE,
    overlap: OVERLAP,
    useCamera: USE_CAMERA,
    cameraDevice: CAMERA_DEVICE,
    videoFile: VIDEO_FILE,
    videoExists: fs.existsSync(VIDEO_FILE)
  });
});

/* ---------------- PROCESSING CORE LOGIC ---------------- */

function startProcessingInternal() {
  if (isProcessingVideo) {
    console.warn("⚠️  Processing already running");
    return;
  }

  // Check source availability
  if (!USE_CAMERA && !fs.existsSync(VIDEO_FILE)) {
    console.error("❌ Video file not found:", VIDEO_FILE);
    return;
  }

  isProcessingVideo = true;
  frameCount = 0;

  let ffmpegArgs;
  
  if (USE_CAMERA) {
    // Camera streaming
    ffmpegArgs = [
      "-f", "v4l2",
      "-i", CAMERA_DEVICE,
      "-vf", "fps=2",
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-q:v", "2",
      "-"
    ];
    console.log("📷 Starting camera capture from", CAMERA_DEVICE);
  } else {
    // Video file
    ffmpegArgs = [
      "-i", VIDEO_FILE,
      "-vf", "fps=1",
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-q:v", "2",
      "-"
    ];
    console.log("🎬 Starting video file processing");
  }

  ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

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

  ffmpegProcess.on("error", (err) => {
    console.error("❌ FFmpeg error:", err.message);
    isProcessingVideo = false;
  });

  ffmpegProcess.on("close", () => {
    console.log("⏹️  Processing stopped");
    isProcessingVideo = false;
  });
}

/* ---------------- START PROCESSING ENDPOINT ---------------- */

app.post("/api/start-processing", (_, res) => {
  startProcessingInternal();
  res.json({ success: true, source: USE_CAMERA ? "camera" : "video" });
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

let cameraStream = null;

app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "multipart/x-mixed-replace; boundary=--boundary");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  let ffmpegArgs;
  
  // Use camera if available, otherwise fall back to video file
  if (USE_CAMERA && fs.existsSync(CAMERA_DEVICE)) {
    ffmpegArgs = [
      "-f", "v4l2",
      "-i", CAMERA_DEVICE,
      "-vf", "fps=10",
      "-f", "mjpeg",
      "-q:v", "5",
      "-"
    ];
  } else {
    // Fall back to video file
    ffmpegArgs = [
      "-i", VIDEO_FILE,
      "-vf", "fps=5",
      "-f", "mjpeg",
      "-q:v", "5",
      "-"
    ];
  }

  // Start stream
  if (!cameraStream) {
    cameraStream = spawn("ffmpeg", ffmpegArgs);

    cameraStream.on("error", (err) => {
      console.error("❌ Stream error:", err.message);
      cameraStream = null;
    });

    cameraStream.on("close", () => {
      console.log("⏹️  Stream closed");
      cameraStream = null;
    });
  }

  let bufferData = Buffer.alloc(0);

  const dataHandler = (chunk) => {
    bufferData = Buffer.concat([bufferData, chunk]);
    
    const startMarker = Buffer.from([0xff, 0xd8]);
    const endMarker = Buffer.from([0xff, 0xd9]);
    
    let startIdx = bufferData.indexOf(startMarker);
    let endIdx = bufferData.indexOf(endMarker);
    
    while (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const frame = bufferData.slice(startIdx, endIdx + 2);
      
      res.write("--boundary\r\n");
      res.write("Content-Type: image/jpeg\r\n");
      res.write(`Content-Length: ${frame.length}\r\n\r\n`);
      res.write(frame);
      res.write("\r\n");
      
      bufferData = bufferData.slice(endIdx + 2);
      startIdx = bufferData.indexOf(startMarker);
      endIdx = bufferData.indexOf(endMarker);
    }
  };

  cameraStream.stdout.on("data", dataHandler);

  req.on("close", () => {
    if (cameraStream) {
      cameraStream.stdout.removeListener("data", dataHandler);
    }
  });
});

/* -------- DEBUG: DETAILED ROBOFLOW ANALYSIS -------- */

app.post("/debug/analyze-roboflow", async (_, res) => {
  if (!fs.existsSync(VIDEO_FILE)) {
    return res.status(400).json({ error: "Video not found" });
  }

  console.log("\n" + "=".repeat(70));
  console.log("🔬 ROBOFLOW API DETAILED ANALYSIS");
  console.log("=".repeat(70));

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
    const form = new FormData();
    form.append("file", imageBuffer, {
      filename: "frame.jpg",
      contentType: "image/jpeg"
    });

    const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`;
    
    try {
      console.log(`\n📊 Testing with different confidence levels:\n`);
      
      const confidenceLevels = [0.1, 0.2, 0.3, 0.5, 0.7];
      const results = {};

      for (const conf of confidenceLevels) {
        const testForm = new FormData();
        testForm.append("file", imageBuffer, {
          filename: "frame.jpg",
          contentType: "image/jpeg"
        });

        try {
          const response = await axios.post(
            url,
            testForm,
            {
              params: {
                api_key: ROBOFLOW_API_KEY,
                confidence: conf,
                overlap: 0.5
              },
              headers: {
                ...testForm.getHeaders()
              },
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              timeout: 30000
            }
          );

          const predictions = response.data.predictions || [];
          results[conf] = predictions;
          
          console.log(`  Confidence ${conf}: ${predictions.length} detections`);
          
          if (predictions.length > 0) {
            predictions.forEach((p, i) => {
              console.log(`    [${i+1}] ${p.class} @ ${(p.confidence * 100).toFixed(1)}%`);
            });
          }
        } catch (err) {
          console.log(`  Confidence ${conf}: ERROR - ${err.message}`);
        }
      }

      console.log("\n📋 Summary:");
      console.log(`  Model: ${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`);
      console.log(`  Frame Size: ${imageBuffer.length} bytes`);
      console.log(`  API Response: ${Object.keys(results).length} tests completed`);
      
      const hasDetections = Object.values(results).some(preds => preds.length > 0);
      console.log(`  Classes Found: ${hasDetections ? 'YES' : 'NONE'}`);
      
      if (hasDetections) {
        const allClasses = new Set();
        Object.values(results).forEach(preds => {
          preds.forEach(p => allClasses.add(p.class));
        });
        console.log(`  Unique Classes: ${Array.from(allClasses).join(", ")}`);
      }

      console.log("\n" + "=".repeat(70));

      res.json({
        success: true,
        frameSize: imageBuffer.length,
        model: `${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`,
        results: results,
        hasDetections: hasDetections,
        allClasses: hasDetections ? Array.from(new Set(
          Object.values(results)
            .flat()
            .map(p => p.class)
        )) : []
      });
    } catch (error) {
      console.error("❌ Analysis Error:", error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
});

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

/* ---------------- ROBOFLOW INFERENCE ---------------- */

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
