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

const CONFIDENCE = parseFloat(process.env.ROBOFLOW_CONFIDENCE || "0.55");
const OVERLAP = parseFloat(process.env.ROBOFLOW_OVERLAP || "0.3");
const FRAME_SAMPLE_RATE = parseInt(process.env.FRAME_SAMPLE_RATE || "2");
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || "3");
const CAMERA_TIMEOUT_MS = parseInt(process.env.CAMERA_TIMEOUT_MS || "60000");
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

let ffmpegProcess = null;
let isProcessingVideo = false;
let frameCount = 0;

let webcamProcess = null;
let isProcessingWebcam = false;
let webcamFrameCount = 0;

let frameWidth = 640;
let frameHeight = 480;

let pythonInferenceProcess = null;
let inferenceReady = false;

let processingQueue = [];
let isProcessingFrame = false;

let lastFrameTime = Date.now();
let cameraHealthInterval = null;

/* ---------------- SERVER ---------------- */

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║   🛡️  PPE DETECTION SYSTEM v2.0 (FIXED FFMPEG)              ║
╚══════════════════════════════════════════════════════════════╝
🚀 http://127.0.0.1:${PORT}
📹 Video: ${VIDEO_FILE}
🎯 Roboflow: ${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}
🤖 Local: YOLOv8l + hardhat-best.pt
⚡ Confidence: ${CONFIDENCE} | Overlap: ${OVERLAP}
🔄 Frame Sample Rate: 1/${FRAME_SAMPLE_RATE}
`);

  initializePythonInference();
});

/* --------------- PYTHON INFERENCE SERVICE --------------- */

function initializePythonInference() {
  console.log("\n🐍 Starting Python inference service...");
  
  try {
    // Use venv Python for proper package isolation
    const pythonExecutable = path.join(__dirname, '.venv', 'bin', 'python');
    pythonInferenceProcess = spawn(pythonExecutable, ["inference_service.py"], {
      cwd: __dirname,
      stdio: ["pipe", "pipe", "pipe"]
    });
    
    pythonInferenceProcess.on("error", (error) => {
      console.error("❌ Python process error:", error.message);
      inferenceReady = false;
    });
    
    pythonInferenceProcess.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message.includes("✓") || message.includes("INFO")) {
        console.log(`🐍 ${message}`);
        if (message.includes("Ready")) {
          inferenceReady = true;
        }
      } else if (message.includes("ERROR")) {
        console.error(`🐍 ${message}`);
      }
    });
    
    pythonInferenceProcess.on("close", (code) => {
      console.log(`🐍 Python process closed with code ${code}`);
      inferenceReady = false;
      
      if (isProcessingWebcam) {
        setTimeout(() => {
          console.log("🔄 Restarting Python inference service...");
          initializePythonInference();
        }, 2000);
      }
    });
    
  } catch (error) {
    console.error("❌ Failed to start Python inference service:", error.message);
    inferenceReady = false;
  }
}

/* --------------- WEBSOCKETS --------------- */

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
  const deadClients = [];
  
  clients.forEach(ws => {
    if (ws.readyState === 1) {
      try {
        ws.send(message);
      } catch (error) {
        deadClients.push(ws);
      }
    } else {
      deadClients.push(ws);
    }
  });
  
  deadClients.forEach(ws => clients.delete(ws));
}

/* ---------------- HEALTH ---------------- */

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    videoExists: fs.existsSync(VIDEO_FILE),
    isProcessing: isProcessingVideo,
    isProcessingWebcam: isProcessingWebcam,
    inferenceReady: inferenceReady,
    clients: clients.size,
    queueSize: processingQueue.length,
    frameWidth,
    frameHeight,
    lastFrameAge: Date.now() - lastFrameTime
  });
});

/* ---------------- CAMERA HEALTH MONITORING ---------------- */

function startCameraHealthMonitoring() {
  if (cameraHealthInterval) {
    clearInterval(cameraHealthInterval);
  }
  
  cameraHealthInterval = setInterval(() => {
    const timeSinceLastFrame = Date.now() - lastFrameTime;
    
    if (timeSinceLastFrame > CAMERA_TIMEOUT_MS && isProcessingWebcam) {
      console.error(`❌ Camera timeout: No frames for ${timeSinceLastFrame}ms`);
      
      broadcast({
        eventType: "WEBCAM_ERROR",
        error: "Camera timeout",
        message: `No frames received for ${Math.round(timeSinceLastFrame / 1000)}s`
      });
      
      console.log("🔄 Attempting to restart camera...");
      stopWebcamProcessing();
      
      setTimeout(() => {
        if (!isProcessingWebcam) {
          console.log("🎥 Restarting camera after timeout...");
          startWebcamProcessing();
        }
      }, 2000);
    }
  }, 10000);
}

function stopCameraHealthMonitoring() {
  if (cameraHealthInterval) {
    clearInterval(cameraHealthInterval);
    cameraHealthInterval = null;
  }
}

/* ---------------- VIDEO STREAMING ---------------- */

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

/* ---------------- WEBCAM STREAMING (MJPEG) ---------------- */

const webcamClients2 = new Set();
let latestWebcamFrame = null;

app.get("/webcam", (req, res) => {
  console.log("🎥 Webcam stream requested");
  
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=--boundary",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Transfer-Encoding": "chunked"
  });

  if (latestWebcamFrame) {
    try {
      res.write("--boundary\r\n");
      res.write("Content-Type: image/jpeg\r\n");
      res.write(`Content-Length: ${latestWebcamFrame.length}\r\n\r\n`);
      res.write(latestWebcamFrame);
      res.write("\r\n");
    } catch (e) {
      // Ignore
    }
  }

  const frameHandler = (frame) => {
    try {
      res.write("--boundary\r\n");
      res.write("Content-Type: image/jpeg\r\n");
      res.write(`Content-Length: ${frame.length}\r\n\r\n`);
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

  req.on("error", () => {
    webcamClients2.delete(frameHandler);
  });

  const timeout = setTimeout(() => {
    if (webcamClients2.has(frameHandler)) {
      webcamClients2.delete(frameHandler);
      try {
        res.end();
      } catch (e) {
        // Ignore
      }
    }
  }, 60000);

  res.on("close", () => {
    clearTimeout(timeout);
  });
});

function broadcastWebcamFrame(frame) {
  latestWebcamFrame = frame;
  lastFrameTime = Date.now();
  
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

/* --------------- START WEBCAM PROCESSING --------------- */

function startWebcamProcessing() {
  if (isProcessingWebcam) {
    console.log("⚠️  Webcam already processing");
    return { success: false, error: "Already running" };
  }

  isProcessingWebcam = true;
  webcamFrameCount = 0;
  processingQueue = [];
  lastFrameTime = Date.now();

  console.log("\n🎥 Starting webcam PPE detection...");
  console.log(`⚙️  Settings: Confidence=${CONFIDENCE}, Overlap=${OVERLAP}, SampleRate=1/${FRAME_SAMPLE_RATE}`);

  startCameraHealthMonitoring();

  // FIXED: FFmpeg command with proper V4L2 format handling
  webcamProcess = spawn("ffmpeg", [
    "-f", "v4l2",                      // Video4Linux2 input
    "-input_format", "yuyv422",         // Native V4L2 format (skip conversion, faster)
    "-video_size", "640x480",           // Set resolution first
    "-framerate", "30",                 // Capture at 30 fps
    "-i", "/dev/video0",                // Camera device (/dev/video0 or /dev/video1)
    "-vf", "fps=10",                    // Output at 10 FPS for processing
    "-f", "image2pipe",                 // Output format
    "-vcodec", "mjpeg",                 // MJPEG codec
    "-q:v", "2",                        // Quality (2-5, lower = better)
    "pipe:1"                            // Output to stdout
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let buffer = Buffer.alloc(0);
  let errorOccurred = false;

  webcamProcess.stdout.on("data", async chunk => {
    if (errorOccurred) return;
    
    buffer = Buffer.concat([buffer, chunk]);

    if (buffer.length > MAX_BUFFER_SIZE) {
      console.warn(`⚠️  Buffer overflow: ${buffer.length} bytes, resetting`);
      buffer = Buffer.alloc(0);
      return;
    }

    const endMarker = Buffer.from([0xff, 0xd9]);
    let idx;

    while ((idx = buffer.indexOf(endMarker)) !== -1) {
      const frame = buffer.slice(0, idx + 2);
      buffer = buffer.slice(idx + 2);

      webcamFrameCount++;
      lastFrameTime = Date.now();
      
      broadcastWebcamFrame(frame);
      
      if (webcamFrameCount % FRAME_SAMPLE_RATE === 0) {
        queueFrameProcessing(frame, webcamFrameCount, 'webcam');
      }
    }
  });

  webcamProcess.stderr.on("data", (data) => {
    const message = data.toString();
    
    // Check for critical errors
    if (message.includes("Device or resource busy")) {
      errorOccurred = true;
      console.error("❌ Webcam device is busy. Kill other processes using /dev/video1");
      
      broadcast({
        eventType: "WEBCAM_ERROR",
        error: "Device busy",
        message: "Run: pkill -f 'ffmpeg.*video1' or fuser -k /dev/video1"
      });
      
      stopWebcamProcessing();
      return;
    }
    
    if (message.includes("Invalid argument") || message.includes("Error while")) {
      console.error("❌ FFmpeg parameter error:", message.substring(0, 200));
      errorOccurred = true;
      
      broadcast({
        eventType: "WEBCAM_ERROR",
        error: "FFmpeg error",
        message: "Camera format not supported. Check /dev/video1"
      });
      
      stopWebcamProcessing();
      return;
    }
    
    // Ignore common info messages
    if (message.includes("frame=") || message.includes("fps=") || 
        message.includes("Stream") || message.includes("Duration")) {
      return;
    }
    
    // Log other errors
    if (message.toLowerCase().includes("error")) {
      console.error("❌ FFmpeg:", message.substring(0, 200));
    }
  });

  webcamProcess.on("close", (code) => {
    console.log(`🎥 Webcam process closed with code ${code}`);
    stopWebcamProcessing();
  });

  webcamProcess.on("error", (error) => {
    errorOccurred = true;
    console.error("❌ Webcam process error:", error.message);
    
    broadcast({
      eventType: "WEBCAM_ERROR",
      error: "Process error",
      message: error.message
    });
    
    stopWebcamProcessing();
  });

  return { success: true, message: "Webcam started" };
}

app.post("/api/start-webcam-processing", (_, res) => {
  const result = startWebcamProcessing();
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

/* --------------- STOP WEBCAM PROCESSING --------------- */

function stopWebcamProcessing() {
  isProcessingWebcam = false;
  
  stopCameraHealthMonitoring();
  
  if (webcamProcess) {
    try {
      webcamProcess.kill("SIGTERM");
      
      setTimeout(() => {
        if (webcamProcess) {
          webcamProcess.kill("SIGKILL");
        }
      }, 2000);
    } catch (e) {
      console.error("Error killing webcam process:", e.message);
    }
    
    webcamProcess = null;
  }
  
  processingQueue = [];
  
  console.log("🎥 Webcam processing stopped");
}

app.post("/api/stop-webcam-processing", (_, res) => {
  stopWebcamProcessing();
  res.json({ success: true, message: "Webcam stopped" });
});

/* --------------- FRAME QUEUE PROCESSING --------------- */

function queueFrameProcessing(imageBuffer, frameNumber, source = 'webcam') {
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
  
  setImmediate(processNextFrame);
}

/* --------------- WEBCAM FRAME PROCESSING --------------- */

async function processWebcamFrame(imageBuffer, frameNumber) {
  try {
    const [roboflowResults, localResults] = await Promise.allSettled([
      getRoboflowDetections(imageBuffer),
      getLocalDetections(imageBuffer)
    ]).then(results => [
      results[0].status === 'fulfilled' ? results[0].value : { predictions: [] },
      results[1].status === 'fulfilled' ? results[1].value : { detections: [] }
    ]);

    const roboflowPredictions = roboflowResults.predictions || [];
    const localPredictions = localResults.detections || [];
    
    const filteredRoboflow = roboflowPredictions.filter(p => {
      const cls = p.class.toLowerCase();
      return cls.includes('vest') || cls.includes('glove') || cls.includes('jacket');
    });
    
    const filteredLocal = localPredictions.filter(p => {
      const cls = p.class.toLowerCase();
      return cls.includes('person') || cls.includes('hardhat') || cls.includes('helmet');
    });
    
    const allPredictions = [
      ...filteredRoboflow,
      ...filteredLocal
    ];
    
    if (roboflowResults.image) {
      frameWidth = roboflowResults.image.width || 640;
      frameHeight = roboflowResults.image.height || 480;
    } else if (localResults.frame_width && localResults.frame_height) {
      frameWidth = localResults.frame_width;
      frameHeight = localResults.frame_height;
    }
    
    console.log(`✅ Frame #${frameNumber}: ${allPredictions.length} detections (RF: ${filteredRoboflow.length}, Local: ${filteredLocal.length})`);

    if (allPredictions.length > 0) {
      broadcast({
        eventType: "PPE_DETECTION_BATCH_WEBCAM",
        source: "hybrid",
        frame: frameNumber,
        frameWidth: frameWidth,
        frameHeight: frameHeight,
        count: allPredictions.length,
        predictions: allPredictions.map(p => ({
          type: p.class,
          confidence: p.confidence,
          source: p.source || "unknown",
          boundingBox: {
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height
          }
        })),
        timestamp: new Date().toISOString()
      });
    }

  } catch (e) {
    console.error(`❌ Frame #${frameNumber} Error:`, e.message);
  }
}

/* --------------- API CALLS --------------- */

async function getRoboflowDetections(imageBuffer) {
  try {
    const form = new FormData();
    form.append("file", imageBuffer, {
      filename: "webcam-frame.jpg",
      contentType: "image/jpeg"
    });

    const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}/${ROBOFLOW_VERSION}`;
    
    const response = await axios.post(url, form, {
      params: {
        api_key: ROBOFLOW_API_KEY,
        confidence: CONFIDENCE,
        overlap: OVERLAP,
        image_info: true
      },
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 10000
    });

    return {
      predictions: (response.data.predictions || []).map(p => ({
        ...p,
        source: "roboflow"
      })),
      image: response.data.image
    };
  } catch (e) {
    console.error(`❌ Roboflow API Error:`, e.message);
    return { predictions: [], image: null };
  }
}

async function getLocalDetections(imageBuffer) {
  return new Promise((resolve) => {
    if (!pythonInferenceProcess || !pythonInferenceProcess.stdout || !inferenceReady) {
      resolve({ detections: [], frame_width: 640, frame_height: 480 });
      return;
    }
    
    const base64Image = imageBuffer.toString("base64");
    const request = {
      image: base64Image,
      confidence: CONFIDENCE
    };
    
    const responseHandler = (data) => {
      try {
        const result = JSON.parse(data.toString());
        
        if (result.success) {
          pythonInferenceProcess.stdout.removeListener("data", responseHandler);
          resolve({
            detections: (result.detections || []).map(d => ({
              class: d.class,
              x: d.x,
              y: d.y,
              width: d.width,
              height: d.height,
              confidence: d.confidence,
              source: "local"
            })),
            frame_width: result.frame_width,
            frame_height: result.frame_height
          });
        }
      } catch (error) {
        console.error("❌ Parse error:", error.message);
      }
    };
    
    pythonInferenceProcess.stdout.once("data", responseHandler);
    
    try {
      pythonInferenceProcess.stdin.write(JSON.stringify(request) + "\n");
      
      setTimeout(() => {
        pythonInferenceProcess.stdout.removeListener("data", responseHandler);
        resolve({ detections: [], frame_width: 640, frame_height: 480 });
      }, 10000);
    } catch (error) {
      resolve({ detections: [], frame_width: 640, frame_height: 480 });
    }
  });
}

/* --------------- VIDEO PROCESSING --------------- */

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

    if (buffer.length > MAX_BUFFER_SIZE) {
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

app.post("/api/stop-processing", (_, res) => {
  isProcessingVideo = false;
  ffmpegProcess?.kill("SIGTERM");
  ffmpegProcess = null;
  processingQueue = [];
  res.json({ success: true });
});

async function processFrame(imageBuffer, frameNumber) {
  try {
    // Use local model inference instead of Roboflow
    const base64Image = imageBuffer.toString("base64");
    const request = {
      image: base64Image,
      confidence: CONFIDENCE
    };

    // Send to Python inference service for local processing
    const result = await new Promise((resolve) => {
      if (!pythonInferenceProcess || !pythonInferenceProcess.stdout || !inferenceReady) {
        resolve({ success: false, detections: [] });
        return;
      }

      const responseHandler = (data) => {
        try {
          const result = JSON.parse(data.toString());
          if (result.success) {
            pythonInferenceProcess.stdout.removeListener("data", responseHandler);
            resolve(result);
          }
        } catch (error) {
          console.error("❌ Parse error:", error.message);
        }
      };

      pythonInferenceProcess.stdout.once("data", responseHandler);

      try {
        pythonInferenceProcess.stdin.write(JSON.stringify(request) + "\n");

        setTimeout(() => {
          pythonInferenceProcess.stdout.removeListener("data", responseHandler);
          resolve({ success: false, detections: [] });
        }, 10000);
      } catch (error) {
        resolve({ success: false, detections: [] });
      }
    });

    if (!result.success) {
      return;
    }

    const predictions = result.detections || [];
    
    if (result.frame_width && result.frame_height) {
      frameWidth = result.frame_width;
      frameHeight = result.frame_height;
    }
    
    console.log(`✅ Frame #${frameNumber}: ${predictions.length} detections (Local Model)`);

    // Send batch of predictions
    if (predictions.length > 0 || frameNumber % 10 === 0) {
      broadcast({
        eventType: "PPE_DETECTION_BATCH_VIDEO",
        source: "local",
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
    }

  } catch (e) {
    console.error(`❌ Frame #${frameNumber} Error:`, e.message);
  }
}

/* ---------------- STATUS ---------------- */

app.get("/api/status", (_, res) => {
  res.json({
    isProcessing: isProcessingVideo,
    isProcessingWebcam: isProcessingWebcam,
    frameCount: frameCount,
    webcamFrameCount: webcamFrameCount,
    clients: clients.size,
    queueSize: processingQueue.length,
    inferenceReady: inferenceReady,
    lastFrameAge: Date.now() - lastFrameTime
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
    queueSize: processingQueue.length,
    inferenceReady: inferenceReady
  });
});

/* ---------------- SHUTDOWN ---------------- */

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("\n🛑 Shutting down...");
  
  stopWebcamProcessing();
  
  isProcessingVideo = false;
  ffmpegProcess?.kill("SIGTERM");
  pythonInferenceProcess?.kill("SIGTERM");
  
  processingQueue = [];
  
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
}

export default app;