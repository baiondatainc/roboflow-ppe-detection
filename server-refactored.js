#!/usr/bin/env node

/**
 * PPE Detection System - Refactored Server
 * Using SOLID principles with modular architecture
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import service classes
import { PythonInferenceService } from './lib/PythonInferenceService.js';
import { DetectionAPI } from './lib/DetectionAPI.js';
import { WebSocketBroadcaster } from './lib/WebSocketBroadcaster.js';
import { WebcamProcessor } from './lib/WebcamProcessor.js';
import { VideoStreamProcessor } from './lib/VideoStreamProcessor.js';
import { DetectionService } from './lib/DetectionService.js';

// Load environment
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// CONFIGURATION
// ============================================================

const config = {
  port: process.env.PORT || 3001,
  videoFile: process.env.VIDEO_FILE || './ppe-upload-video-new1.mp4',
  roboflow: {
    apiKey: process.env.ROBOFLOW_API_KEY,
    model: process.env.ROBOFLOW_MODEL,
    version: process.env.ROBOFLOW_VERSION,
    confidence: parseFloat(process.env.ROBOFLOW_CONFIDENCE || '0.55'),
    overlap: parseFloat(process.env.ROBOFLOW_OVERLAP || '0.3')
  },
  detection: {
    confidence: parseFloat(process.env.ROBOFLOW_CONFIDENCE || '0.55'),
    frameRate: parseInt(process.env.FRAME_SAMPLE_RATE || '2'),
    maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || '3'),
    cameraTimeoutMs: parseInt(process.env.CAMERA_TIMEOUT_MS || '60000')
  },
  webcam: {
    device: process.env.WEBCAM_DEVICE || '/dev/video0',
    videoSize: '640x480',
    framerate: 30,
    outputFps: 10
  }
};

// ============================================================
// INITIALIZE SERVICES
// ============================================================

// 1. Python Inference Service
const pythonInference = new PythonInferenceService(config.detection);

// 2. Detection API (Roboflow)
const detectionAPI = new DetectionAPI(config.roboflow);

// 3. Express App & WebSocket
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║   🛡️  PPE DETECTION SYSTEM v3.0 (REFACTORED)                ║
║        SOLID Architecture with Modular Classes              ║
╚══════════════════════════════════════════════════════════════╝
🚀 http://127.0.0.1:${config.port}
📹 Video: ${config.videoFile}
🎯 Roboflow: ${config.roboflow.model}/${config.roboflow.version}
🤖 Local: YOLOv8l + hardhat-best.pt
⚡ Confidence: ${config.detection.confidence}
🔄 Frame Rate: 1/${config.detection.frameRate}
📦 Architecture: SOLID Modular Classes
  ✓ PythonInferenceService
  ✓ DetectionAPI
  ✓ WebSocketBroadcaster
  ✓ WebcamProcessor
  ✓ VideoStreamProcessor
  ✓ DetectionService
`);

  pythonInference.initialize();
});

// 4. WebSocket Broadcaster
const broadcaster = new WebSocketBroadcaster(server);

// 5. Detection Service (Orchestrator)
const detectionService = new DetectionService({
  localInference: pythonInference,
  roboflowAPI: detectionAPI,
  broadcaster,
  ...config.detection
});

// 6. Processors
const webcamProcessor = new WebcamProcessor({
  ...config.webcam,
  ...config.detection
});

const videoProcessor = new VideoStreamProcessor({
  videoFile: config.videoFile,
  ...config.detection
});

// ============================================================
// FRAME PROCESSORS
// ============================================================

/**
 * Process webcam frame
 */
const processWebcamFrame = async (frameData) => {
  // Broadcast frame to all connected /webcam clients
  if (frameData.jpegBuffer) {
    broadcastWebcamFrame(frameData.jpegBuffer);
  }
  // Run detection on frame
  await detectionService.processFrame(frameData.imageBuffer, frameData.frameNumber);
};

/**
 * Process video frame
 */
const processVideoFrame = async (frameData) => {
  await detectionService.processFrame(frameData.imageBuffer, frameData.frameNumber);
};

// Set frame processors
webcamProcessor.setFrameProcessor(processWebcamFrame);
videoProcessor.setFrameProcessor(processVideoFrame);

// ============================================================
// ROUTES - HEALTH & STATUS
// ============================================================

app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    videoExists: videoProcessor.videoExists(),
    isProcessingVideo: videoProcessor.isProcessing,
    isProcessingWebcam: webcamProcessor.isProcessing,
    ...detectionService.getStatus()
  });
});

app.get('/api/status', (_, res) => {
  res.json({
    webcam: webcamProcessor.getStatus(),
    video: videoProcessor.getStatus(),
    detection: detectionService.getStatus()
  });
});

app.get('/stats', (_, res) => {
  res.json({
    status: 'ok',
    webcam: webcamProcessor.getStatus(),
    video: videoProcessor.getStatus(),
    detection: detectionService.getStatus()
  });
});

// ============================================================
// ROUTES - VIDEO STREAMING
// ============================================================

app.get('/video', (req, res) => {
  if (!videoProcessor.videoExists()) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const videoStats = fs.statSync(config.videoFile);
  const videoSize = videoStats.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${videoSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'video/mp4'
    });

    res.end(fs.readFileSync(config.videoFile, { start, end }));
  } else {
    res.writeHead(200, {
      'Content-Length': videoSize,
      'Content-Type': 'video/mp4'
    });
    res.end(fs.readFileSync(config.videoFile));
  }
});

// ============================================================
// ROUTES - WEBCAM STREAMING
// ============================================================

const webcamClients = new Set();
let latestWebcamFrame = null;

app.get('/webcam', (req, res) => {
  console.log('🎥 Webcam stream requested');

  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=--boundary',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Transfer-Encoding': 'chunked'
  });

  if (latestWebcamFrame) {
    res.write('--boundary\r\nContent-Type: image/jpeg\r\nContent-Length: ' +
      latestWebcamFrame.length + '\r\n\r\n');
    res.write(latestWebcamFrame);
    res.write('\r\n');
  }

  const frameHandler = (frame) => {
    try {
      res.write('--boundary\r\nContent-Type: image/jpeg\r\nContent-Length: ' +
        frame.length + '\r\n\r\n');
      res.write(frame);
      res.write('\r\n');
    } catch (e) {
      webcamClients.delete(frameHandler);
    }
  };

  webcamClients.add(frameHandler);

  req.on('close', () => {
    webcamClients.delete(frameHandler);
  });

  req.on('error', () => {
    webcamClients.delete(frameHandler);
  });

  const timeout = setTimeout(() => {
    webcamClients.delete(frameHandler);
    res.end();
  }, 60000);

  res.on('close', () => {
    clearTimeout(timeout);
    webcamClients.delete(frameHandler);
  });
});

/**
 * Broadcast webcam frame to all clients
 */
function broadcastWebcamFrame(frame) {
  latestWebcamFrame = frame;
  const toRemove = [];

  webcamClients.forEach(handler => {
    try {
      handler(frame);
    } catch (error) {
      toRemove.push(handler);
    }
  });

  toRemove.forEach(handler => webcamClients.delete(handler));
}

// ============================================================
// ROUTES - WEBCAM CONTROL
// ============================================================

app.post('/api/start-webcam-processing', (_, res) => {
  const result = webcamProcessor.start();
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.post('/api/stop-webcam-processing', (_, res) => {
  webcamProcessor.stop();
  res.json({ success: true, message: 'Webcam stopped' });
});

// ============================================================
// ROUTES - VIDEO CONTROL
// ============================================================

app.post('/api/start-processing', (_, res) => {
  const result = videoProcessor.start();
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.post('/api/stop-processing', (_, res) => {
  videoProcessor.stop();
  res.json({ success: true, message: 'Video processing stopped' });
});

// ============================================================
// SHUTDOWN HANDLER
// ============================================================

function shutdown() {
  console.log('\n🛑 Shutting down...');

  pythonInference.shutdown();
  webcamProcessor.shutdown();
  videoProcessor.shutdown();
  broadcaster.shutdown();
  webcamClients.clear();

  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
