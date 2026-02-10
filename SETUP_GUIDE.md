# PPE Detection Backend - Setup & Operation Guide

## ✅ What's Fixed

The backend has been updated to properly:
1. **Stream from camera** when enabled (`USE_CAMERA=true`)
2. **Process frames with Roboflow API** for PPE detection
3. **Normalize bounding box coordinates** for accurate canvas rendering
4. **Non-blocking frame processing** to prevent stream interruption
5. **Proper fallback logic** between camera and video file sources

---

## 🚀 Quick Start

### Prerequisites
- Node.js v14+
- FFmpeg installed (`ffmpeg` command available)
- Camera device at `/dev/video0` (or configured path)
- Roboflow API key

### Installation

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd vision-ui
npm install
cd ..
```

### Configuration

Edit `.env` file with your settings:

```properties
# Server
PORT=3001

# Camera Source
USE_CAMERA=true
CAMERA_DEVICE=/dev/video0

# Video Fallback (used if camera unavailable)
VIDEO_FILE=./ppe-upload-video-new1.mp4

# Roboflow API
ROBOFLOW_API_KEY=YOUR_API_KEY_HERE
ROBOFLOW_MODEL=ppe-detection-soydn-wdpr0
ROBOFLOW_VERSION=1

# Detection Settings
ROBOFLOW_CONFIDENCE=0.1          # Lower = more detections (0.0-1.0)
ROBOFLOW_OVERLAP=0.3             # NMS overlap threshold (0.0-1.0)
FRAME_SAMPLE_RATE=1              # Process every Nth frame (1=all frames)

# Auto-start processing on server start
AUTO_START_PROCESSING=true
```

### Running the Backend

```bash
# Start backend (port 3001)
npm start

# Output should show:
# ╔════════════════════════════════════════════════════════════╗
# ║     🛡️  ROBOFLOW PPE DETECTION BACKEND (READY)             ║
# ╚════════════════════════════════════════════════════════════╝
# 🚀 http://127.0.0.1:3001
# 📹 Source: 📷 Camera /dev/video0
# 🎯 Model: ppe-detection-soydn-wdpr0/1
# 🔍 Detection: Helmets & Gloves
```

### Running the Frontend

In a new terminal:

```bash
cd vision-ui
npm run dev

# Opens at http://localhost:5173 (or similar)
```

---

## 📊 Key Endpoints

### Health & Status
- **GET** `/health` - Server health check
- **GET` `/api/status` - Processing status
- **GET** `/stats` - Detailed statistics
- **GET** `/debug/config` - Current configuration

### Processing Control
- **POST** `/api/start-processing` - Start PPE detection
- **POST** `/api/stop-processing` - Stop detection
- **GET** `/stream` - MJPEG video stream with real-time feed

### Testing & Debugging
- **POST** `/debug/test-roboflow` - Test API with single frame
- **POST** `/debug/analyze-roboflow` - Test multiple confidence levels
- **GET** `/video` - Raw video file streaming

---

## 🎯 How It Works

### Data Flow

```
Camera/Video File (FFmpeg)
        ↓
  Extract Frames (JPEG)
        ↓
  Sample Frames (FRAME_SAMPLE_RATE)
        ↓
  Roboflow API (Detection)
        ↓
  Broadcast via WebSocket
        ↓
  Frontend Canvas Rendering
```

### Bounding Box Coordinates

Roboflow returns bounding boxes as:
- **x, y**: Center coordinates (in pixels)
- **width, height**: Dimensions (in pixels)

The frontend converts these to top-left corner format for canvas rendering:
```javascript
const x = centerX - width / 2;
const y = centerY - height / 2;
```

---

## 🔧 Troubleshooting

### Camera Not Detected

```bash
# Check available video devices
ls -l /dev/video*

# Test camera with FFmpeg
ffmpeg -f v4l2 -input_format mjpeg -video_size 640x480 -framerate 10 -i /dev/video0 -frames:v 1 test-frame.jpg

# Update CAMERA_DEVICE in .env if different
```

### No Detections Appearing

1. **Check API Key**: Run `curl http://localhost:3001/debug/config`
2. **Test API**: Run `curl -X POST http://localhost:3001/debug/test-roboflow`
3. **Lower Confidence**: Set `ROBOFLOW_CONFIDENCE=0.1` to catch more detections
4. **Check Network**: Ensure internet connection to Roboflow API

### Stream Freezing

- Reduce `FRAME_SAMPLE_RATE` (e.g., from 1 to 2 or 3)
- Increase `ROBOFLOW_CONFIDENCE` to skip slow frames
- Check internet connection to Roboflow API

### High CPU Usage

- Increase `FRAME_SAMPLE_RATE` (process fewer frames)
- Close other applications
- Reduce stream resolution by modifying FFmpeg args

---

## 📝 Log Examples

### Successful Detection
```
📹 Frame #42 | Size: 45823 bytes
🌐 Calling: https://detect.roboflow.com/ppe-detection-soydn-wdpr0/1
✅ Got 3 predictions
🎯 Detections for Frame #42:
   [1] Helmet @ 92.5% | Box: (312, 156, 64x80)
   [2] Gloves @ 88.3% | Box: (425, 298, 52x48)
   [3] Helmet @ 76.1% | Box: (198, 145, 58x75)
```

### API Error
```
❌ Frame #42 Error:
  Status: 401
  Message: Unauthorized
  💡 Hint: Invalid API key or no access to model - check ROBOFLOW_API_KEY
```

---

## 🎨 Frontend Features

- **Live Camera Stream** - Real-time MJPEG display
- **Detection Overlay** - Bounding boxes with confidence scores
- **Live Feed Panel** - Recent detections list
- **Control Panel** - Start/Stop processing
- **Processing Status** - Shows active processing and source type
- **Detection Counter** - Total detections tracked

---

## 📚 Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `USE_CAMERA` | false | Enable camera source |
| `CAMERA_DEVICE` | /dev/video0 | Camera device path |
| `VIDEO_FILE` | ./ppe-upload-video-new1.mp4 | Video file path |
| `ROBOFLOW_API_KEY` | - | Roboflow API key (REQUIRED) |
| `ROBOFLOW_MODEL` | - | Model name (REQUIRED) |
| `ROBOFLOW_VERSION` | - | Model version (REQUIRED) |
| `ROBOFLOW_CONFIDENCE` | 0.5 | Detection confidence threshold |
| `ROBOFLOW_OVERLAP` | 0.5 | NMS overlap threshold |
| `FRAME_SAMPLE_RATE` | 1 | Process every Nth frame |
| `AUTO_START_PROCESSING` | false | Auto-start on server launch |

---

## 🚨 Performance Tips

1. **Optimize Frame Rate**: Adjust `-vf fps=X` in FFmpeg args
2. **Batch Processing**: Increase `FRAME_SAMPLE_RATE` for better throughput
3. **Confidence Tuning**: Higher confidence = faster processing, fewer false positives
4. **Stream Resolution**: Lower resolution = faster detection

---

## 📄 Files Modified

- **server.js** - Fixed camera streaming logic and frame processing
- **StreamViewer.vue** - Updated bounding box coordinate handling
- **.env** - Configuration file (pre-configured)

---

## ✨ Next Steps

1. Start the backend: `npm start`
2. Start the frontend: `cd vision-ui && npm run dev`
3. Open browser: `http://localhost:5173`
4. Click "Start Processing" button
5. Monitor detections in real-time!

---

**Happy detecting! 🛡️👷**
