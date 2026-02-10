# Quick Reference Card

## 🎯 System Status

| Component | Status | Notes |
|-----------|--------|-------|
| Backend Server | ✅ Running | Port 3001 |
| Frontend UI | ✅ Running | Port 5173 |
| WebSocket | ✅ Connected | Real-time events |
| Roboflow API | ✅ Responding | HTTP 200 OK |
| Detections | ❓ 0 found | Need PPE in video/camera |
| CSP Headers | ✅ Fixed | unsafe-inline, unsafe-eval |

## 🚀 Quick Start

```bash
# Terminal 1: Start Backend
cd /home/siva/work/codebase/ppe/roboflow-ppe
node server.js

# Terminal 2: Start Frontend
cd vision-ui
npm run dev

# Open Browser
http://localhost:5173
```

## 📋 Key Endpoints

```bash
# Health Check
curl http://localhost:3001/health

# Show Config
curl http://localhost:3001/debug/config

# Test API
curl -X POST http://localhost:3001/debug/test-roboflow

# Start Processing
curl -X POST http://localhost:3001/api/start-processing

# Stop Processing
curl -X POST http://localhost:3001/api/stop-processing

# Get Status
curl http://localhost:3001/api/status
```

## 🔧 Configuration

**File**: `.env`

```properties
# Source (pick one)
USE_CAMERA=false              # Set to true for camera
VIDEO_FILE=./ppe-upload-video-new1.mp4

# Or for camera
USE_CAMERA=true
CAMERA_DEVICE=/dev/video0

# Roboflow Settings
ROBOFLOW_API_KEY=jlY9qpN7ZBI9Ay5V1xEW
ROBOFLOW_MODEL=ppe-detection-soydn-wdpr0
ROBOFLOW_VERSION=1

# Detection Sensitivity
ROBOFLOW_CONFIDENCE=0.5       # Try 0.2-0.3 for more detections
ROBOFLOW_OVERLAP=0.5
FRAME_SAMPLE_RATE=1           # 1 = all frames
```

## 🎬 Running Modes

### Mode 1: Video File
```properties
USE_CAMERA=false
VIDEO_FILE=./ppe-upload-video-new1.mp4
```
- Processes 1 FPS
- Loops automatically
- Good for testing

### Mode 2: Live Camera
```properties
USE_CAMERA=true
CAMERA_DEVICE=/dev/video0
```
- Captures at 2 FPS
- Continuous stream
- Real-time detection

## 💾 Important Files

| File | Purpose |
|------|---------|
| `server.js` | Backend API & FFmpeg integration |
| `.env` | Configuration & API keys |
| `vision-ui/src/components/StreamViewer.vue` | Frontend display |
| `vision-ui/src/services/socket.js` | WebSocket client |

## 🔍 Debugging

### View Backend Logs
```bash
ps aux | grep "node server.js"
```

### Check API Configuration
```bash
curl http://localhost:3001/debug/config | jq .
```

### Test Frame Processing
```bash
curl -X POST http://localhost:3001/debug/test-roboflow | jq '.predictionCount'
```

### Monitor Frame Rate
```bash
# Will show: Frame #1, Frame #2, etc.
node server.js 2>&1 | grep "Frame #"
```

## ⚙️ Adjustment Guide

### To Get More Detections
1. Lower confidence: `ROBOFLOW_CONFIDENCE=0.2`
2. Use different video with clear PPE
3. Increase frame rate: Edit `fps=2` in server.js

### To Reduce False Positives
1. Raise confidence: `ROBOFLOW_CONFIDENCE=0.7`
2. Increase overlap: `ROBOFLOW_OVERLAP=0.6`

### To Improve Performance
1. Skip frames: `FRAME_SAMPLE_RATE=2` (process every 2nd)
2. Reduce canvas size: Edit StreamViewer.vue
3. Use async processing

## 🆘 Common Issues

| Issue | Solution |
|-------|----------|
| **CSP Error** | ✅ Fixed - Added unsafe-inline/eval headers |
| **0 Predictions** | Try different video or lower confidence |
| **API 401** | Check API key and model access |
| **API 404** | Verify model path: `ppe-detection-soydn-wdpr0/1` |
| **No Camera** | Check: `ls -l /dev/video*` |
| **High Latency** | Increase FRAME_SAMPLE_RATE |

## 📊 Example Data Flow

```
1. FFmpeg extracts frame from video/camera
2. Frame sent to Roboflow API (277KB)
3. API returns predictions (200ms)
4. Detections broadcast via WebSocket
5. Frontend renders bounding boxes on canvas
6. Display updates in real-time
```

## 🎓 Learning Path

1. ✅ Backend API working
2. ✅ Frontend UI working
3. ✅ WebSocket connected
4. ✅ Roboflow API responding
5. ⏳ Getting predictions (next)
6. ⏳ Display detections on canvas
7. ⏳ Record/export detections

---

**Last Update**: February 11, 2026
**System Status**: Ready for testing
**Next Action**: Lower confidence threshold or provide video with clear PPE
