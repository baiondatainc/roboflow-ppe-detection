# System Status & Troubleshooting Guide

## ✅ Fixed Issues

### 1. CSP (Content Security Policy) Error - FIXED
**Problem**: Browser console showed CSP error blocking script evaluation
**Solution**: Added proper CSP headers to allow:
- `unsafe-inline` for Vue component styles
- `unsafe-eval` for Vue runtime compilation
- WebSocket connections (ws: and wss:)

**Applied to**: `server.js` middleware

### 2. Roboflow API Connection - WORKING ✅
**Status**: Successfully connecting to Roboflow API
**Response**: HTTP 200 OK
**Inference Time**: ~47ms per frame
**Model**: ppe-detection-soydn-wdpr0/1

## 🔍 Current Issue: Zero Predictions

### Why are no helmets/gloves being detected?

#### Option 1: Video Content Issue
- The video may not contain people wearing helmets or gloves
- Try with a different video that has clear PPE

#### Option 2: Model Configuration
- Model might be trained for different object classes
- Verify model actually detects "helmet" and "glove" classes

#### Option 3: Confidence Threshold Too High
- Current: 0.5 (50%)
- Try lower: 0.25 or 0.3
- Edit `.env`: `ROBOFLOW_CONFIDENCE=0.3`

## 🧪 Testing the System

### Check Configuration
```bash
curl http://localhost:3001/debug/config | jq .
```

### Test Roboflow API
```bash
curl -X POST http://localhost:3001/debug/test-roboflow | jq .
```

### Test with Lower Confidence
```bash
# Edit .env
ROBOFLOW_CONFIDENCE=0.25

# Restart backend
pkill -f "node server.js"
node server.js &

# Test again
curl -X POST http://localhost:3001/debug/test-roboflow | jq .
```

## 📊 System Architecture

```
┌─────────────┐
│   Camera    │
│ or Video    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│   FFmpeg        │
│  (2 FPS frames) │
└──────┬──────────┘
       │
       ▼
┌────────────────────────┐
│  Frame Processing      │
│  (nodeJS server.js)    │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│  Roboflow API          │
│  (helmet/glove detect) │ ← Currently returning 0 predictions
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│  WebSocket Broadcast   │
│  (to frontend)         │
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────┐
│  Vue Frontend          │
│  (Canvas display)      │
└────────────────────────┘
```

## 📋 Next Steps

### 1. Verify Video Content
```bash
# Check if video has suitable content
ffprobe -v quiet -print_format json -show_format ./ppe-upload-video-new1.mp4 | jq .

# Extract a frame for manual inspection
ffmpeg -ss 00:00:05 -i ./ppe-upload-video-new1.mp4 -frames:v 1 test-frame.jpg
```

### 2. Try Different Confidence Levels
- Edit `.env` and set `ROBOFLOW_CONFIDENCE=0.2`
- Restart backend
- Test again

### 3. Use Test Images with Clear PPE
- Download test images with helmets/gloves
- Use them with the test endpoint

### 4. Verify Model Endpoint
```bash
# Check if model path is correct
curl "https://detect.roboflow.com/ppe-detection-soydn-wdpr0/1?api_key=YOUR_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test-frame.jpg"
```

## 🎯 When Detections Start Working

Once detections appear, they will:
1. Be sent via WebSocket to frontend
2. Display as bounding boxes on canvas
3. Show in real-time statistics panel
4. Log detailed information in console

### Expected Detection Output
```json
{
  "eventType": "PPE_DETECTION",
  "frame": 45,
  "type": "helmet",
  "confidence": 0.87,
  "boundingBox": {
    "x": 35.2,
    "y": 15.5,
    "width": 25.0,
    "height": 30.0
  },
  "timestamp": "2026-02-11T01:35:00.000Z"
}
```

## 🚀 Performance Notes

### Current Setup
- **Frame Rate**: 1 FPS (video) / 2 FPS (camera)
- **API Response**: ~50ms per frame
- **Processing**: Sequential (one frame at a time)
- **Memory**: ~100MB

### To Improve
- Increase FPS: Edit `server.js` fps parameter
- Parallel processing: Handle multiple frames simultaneously
- Frame skipping: Increase `FRAME_SAMPLE_RATE` to skip frames

## 📝 Files Modified

1. **server.js**
   - Added CSP headers middleware
   - Added `/debug/config` endpoint
   - Enhanced error logging
   - Camera support

2. **.env**
   - Added `USE_CAMERA` flag
   - Added `CAMERA_DEVICE` path

3. **StreamViewer.vue**
   - Added source type indicator
   - Updated status text
   - Added camera badge styling

## 🔗 Useful Commands

```bash
# Start everything
make all

# Check backend logs
tail -f backend.log

# Test specific endpoint
curl http://localhost:3001/health | jq .
curl http://localhost:3001/debug/config | jq .
curl -X POST http://localhost:3001/debug/test-roboflow | jq .

# Kill and restart backend
pkill -f "node server.js"
cd /home/siva/work/codebase/ppe/roboflow-ppe && node server.js &

# Monitor API calls
curl -v -X POST http://localhost:3001/debug/test-roboflow

# Check camera device
ls -l /dev/video*
v4l2-ctl --list-devices
```

## 📞 Support

### CSP Header Issues
- CSP now allows: unsafe-inline, unsafe-eval, WebSocket
- Safe for development; review for production

### API Permission Issues
- Verify API key: `curl http://localhost:3001/debug/config`
- Check model name matches Roboflow workspace
- Ensure API key has access to the model

### No Detections
- Lower confidence threshold
- Test with different video/camera
- Verify model is trained for your use case
