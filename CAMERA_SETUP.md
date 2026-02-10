# Camera Setup Guide - Helmet & Glove Detection

## Overview
The system now supports **live camera streaming** for real-time helmet and glove detection using Roboflow AI.

## Configuration

### Enable Camera Mode
Edit `.env` file:
```properties
USE_CAMERA=true
CAMERA_DEVICE=/dev/video0
```

### Disable Camera (Use Video File)
```properties
USE_CAMERA=false
VIDEO_FILE=./ppe-upload-video-new1.mp4
```

## Features

### 📷 Live Camera Capture
- **Source**: USB Webcam or integrated camera
- **Frame Rate**: 2 FPS (adjustable in code)
- **Format**: MJPEG via FFmpeg v4l2 driver

### 🎯 Detection
- **Helmets**: Identifies people wearing safety helmets
- **Gloves**: Detects protective gloves
- **Confidence**: 0.5 (50% threshold, adjustable)

### 🎨 Real-time Visualization
- Live canvas overlay showing bounding boxes
- Color-coded by confidence:
  - 🔴 **Red**: High confidence (>80%)
  - 🟠 **Orange**: Lower confidence (<80%)
- Detection statistics display

## How to Run

### Start Both Services
```bash
make all
```

### Or Start Individually
```bash
# Terminal 1: Backend (Camera Processing)
make backend

# Terminal 2: Frontend (Web Interface)
make frontend
```

### Access the Dashboard
Open browser: `http://localhost:5173`

## Usage

1. **Start Processing**
   - Click "Start Processing" button
   - System will begin capturing camera frames
   - Backend will send frames to Roboflow API

2. **View Detections**
   - Live canvas shows helmet & glove bounding boxes
   - Detection counter updates in real-time
   - List panel shows recent detections

3. **Stop Processing**
   - Click "Stop Processing" to end capture

## Troubleshooting

### Camera Not Found
```bash
# Check available cameras
ls -l /dev/video*

# Update CAMERA_DEVICE in .env
CAMERA_DEVICE=/dev/video1
```

### No Detections Appearing
- Check Roboflow API key validity
- Verify model: `ppe-detection-soydn-wdpr0/1`
- Review backend logs: `tail -f backend.log`

### FFmpeg Error
```bash
# Install FFmpeg
sudo apt-get install ffmpeg

# Check FFmpeg supports v4l2
ffmpeg -devices | grep v4l2
```

## API Endpoints

### Start Processing
```bash
curl -X POST http://localhost:3001/api/start-processing
```

### Stop Processing
```bash
curl -X POST http://localhost:3001/api/stop-processing
```

### Check Status
```bash
curl http://localhost:3001/api/status
```

### Health Check
```bash
curl http://localhost:3001/health
```

### Test Roboflow API
```bash
curl -X POST http://localhost:3001/debug/test-roboflow
```

## WebSocket Events

The backend broadcasts detections via WebSocket:

```json
{
  "eventType": "PPE_DETECTION",
  "frame": 42,
  "type": "helmet",
  "confidence": 0.92,
  "boundingBox": {
    "x": 45.2,
    "y": 10.5,
    "width": 30.0,
    "height": 35.0
  },
  "timestamp": "2026-02-11T01:30:00.000Z"
}
```

## Performance Tips

1. **Increase Frame Rate**
   - Edit `server.js`: Change `fps=2` to `fps=3` or `fps=4`
   - Higher rate = more API calls

2. **Adjust Confidence Threshold**
   - `.env`: `ROBOFLOW_CONFIDENCE=0.7` (70%)
   - Higher = fewer false positives

3. **Reduce Detections Overlay**
   - Display last 20 detections on canvas
   - Configure in `StreamViewer.vue` line ~245

## System Requirements

- FFmpeg v6.0+
- Node.js v18+
- Camera with V4L2 support
- Roboflow API key with access to model

## Environment Variables

```properties
# Server
PORT=3001

# Source
USE_CAMERA=true                        # Enable camera mode
CAMERA_DEVICE=/dev/video0             # Camera device path
VIDEO_FILE=./ppe-upload-video-new1.mp4 # Fallback video file

# Roboflow
ROBOFLOW_API_KEY=your-api-key
ROBOFLOW_MODEL=ppe-detection-soydn-wdpr0
ROBOFLOW_VERSION=1
ROBOFLOW_CONFIDENCE=0.5
ROBOFLOW_OVERLAP=0.5

# Processing
FRAME_SAMPLE_RATE=1                    # Process every Nth frame
```

## Frontend Display

- **Canvas**: 1280x720 grid with detections overlay
- **Stats Panel**: Real-time detection count and timing
- **Detection List**: Last 20 detections with metadata
- **Status Badge**: Shows "📷 LIVE CAMERA" or "🎬 VIDEO FILE"

---

**Last Updated**: February 11, 2026
**Detection Model**: ppe-detection-soydn-wdpr0/1
