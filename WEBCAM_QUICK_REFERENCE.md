# Webcam Feature - Quick Reference Card

## One-Page Cheat Sheet

### Installation / Setup
```bash
# 1. Verify camera
ls -l /dev/video0

# 2. Add user to video group (if needed)
sudo usermod -a -G video $USER
# Then logout/login

# 3. Start backend
npm start

# 4. Open UI and go to "Webcam" tab
http://localhost:3001
```

### Key Files
| File | Purpose |
|------|---------|
| `server.js` | Backend endpoints, FFmpeg, Roboflow API |
| `WebcamViewer.vue` | UI component for webcam display |
| `App.vue` | Navigation tab for Webcam |

### API Endpoints

#### GET /webcam
Streams live MJPEG video from camera
```bash
curl http://localhost:3001/webcam > stream.mjpeg
# Use in: <img src="/webcam">
```

#### POST /api/start-webcam-processing
Start capturing and detecting PPE
```bash
curl -X POST http://localhost:3001/api/start-webcam-processing
# Returns: {"success": true}
```

#### POST /api/stop-webcam-processing
Stop all processing
```bash
curl -X POST http://localhost:3001/api/stop-webcam-processing
# Returns: {"success": true}
```

### WebSocket Event
```javascript
// Listen for detections
socket.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  if (data.eventType === 'PPE_DETECTION_WEBCAM') {
    console.log(data.type, data.confidence);
  }
});
```

Event structure:
```json
{
  "eventType": "PPE_DETECTION_WEBCAM",
  "source": "webcam",
  "frame": 42,
  "type": "person_without_helmet",
  "confidence": 0.95,
  "boundingBox": { "x": 320, "y": 240, "width": 100, "height": 150 },
  "timestamp": "2026-02-11T12:34:56.789Z"
}
```

### Configuration

#### Change Camera Device
Edit `server.js` line 342:
```javascript
"-i", "/dev/video0",  // ← Change to /dev/video1, etc
```

#### Change Detection Frequency
Edit `server.js` line 362:
```javascript
"-vf", "fps=1",  // ← Change to fps=0.5, fps=2, etc
```

#### Change Roboflow Settings
Edit `.env`:
```bash
ROBOFLOW_API_KEY=your_key
ROBOFLOW_MODEL=your_model
ROBOFLOW_VERSION=1
ROBOFLOW_CONFIDENCE=0.5
ROBOFLOW_OVERLAP=0.5
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Camera not found | `ls /dev/video*` or check `/dev/video0` |
| Permission denied | `sudo usermod -a -G video $USER` + logout/login |
| Stream shows nothing | Restart backend, check camera is on |
| No detections | Check Roboflow API key in `.env` |
| WebSocket fails | Ensure backend running on port 3001 |
| FFmpeg error | Check camera device parameter in `server.js` |

### Testing

```bash
# Test all endpoints
./test-webcam-feature.sh

# Check backend health
curl http://localhost:3001/health

# Check API status
curl http://localhost:3001/api/status

# Start processing
curl -X POST http://localhost:3001/api/start-webcam-processing

# Stop processing
curl -X POST http://localhost:3001/api/stop-webcam-processing
```

### Performance Specs

| Metric | Value |
|--------|-------|
| Resolution | 640x480 |
| Capture Rate | 15 fps |
| Processing Rate | 1 fps |
| API Latency | 500-2000ms |
| Bandwidth | ~1-2 Mbps |
| Memory | ~250-350 MB |

### Browser Support
✅ Chrome, Firefox, Safari, Edge (all modern versions)

### Server Architecture
```
Webcam (15 fps)
    ↓
FFmpeg v4l2
    ↓
MJPEG Stream (1-15 fps) + Roboflow (1 fps)
    ↓
WebSocket (real-time detections)
    ↓
Browser Canvas (60 fps rendering)
```

### Files Added/Modified

**New Files:**
- `vision-ui/src/components/WebcamViewer.vue` - Webcam UI component
- `WEBCAM_FEATURE.md` - Full feature documentation
- `WEBCAM_SETUP.md` - Setup and troubleshooting guide
- `WEBCAM_IMPLEMENTATION_SUMMARY.md` - Implementation details
- `WEBCAM_ARCHITECTURE_DIAGRAMS.md` - Visual diagrams
- `WEBCAM_API_DOCUMENTATION.md` - API reference
- `test-webcam-feature.sh` - Testing script

**Modified Files:**
- `server.js` - Added 3 new endpoints + FFmpeg integration
- `vision-ui/src/App.vue` - Added Webcam tab to navigation

### Documentation Index
- **WEBCAM_SETUP.md** - Quick start (read this first)
- **WEBCAM_FEATURE.md** - Complete technical docs
- **WEBCAM_API_DOCUMENTATION.md** - API reference
- **WEBCAM_ARCHITECTURE_DIAGRAMS.md** - Visual diagrams
- **WEBCAM_IMPLEMENTATION_SUMMARY.md** - What was changed
- **test-webcam-feature.sh** - Automated tests

### Server Logs to Look For
```
✅ Webcam PPE detection started
🎥 Webcam stream requested
📹 Webcam Frame #1 | Size: 84891 bytes
✅ Got 3 predictions
📨 Detection received: { eventType: 'PPE_DETECTION_WEBCAM' }
```

### Vue Component Features
- Real-time video streaming
- Canvas overlay with bounding boxes
- Detection history panel
- Live statistics
- Stream status indicator
- Error messages
- Start/Stop controls

### WebSocket Connection
```javascript
// Auto-initialized in WebcamViewer.vue
const socket = new WebSocket("ws://localhost:3001");

socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  // Handle PPE_DETECTION_WEBCAM events
});
```

### FFmpeg Command Used
```bash
ffmpeg -f v4l2 \
  -video_size 640x480 \
  -framerate 15 \
  -i /dev/video0 \
  -vf fps=1 \
  -f image2pipe \
  -vcodec mjpeg \
  -q:v 2 \
  -
```

### Common Customizations

#### Increase Detection Frequency
In `server.js` line 362:
```javascript
"-vf", "fps=2",  // 2 frames per second instead of 1
```

#### Improve Stream Quality
In `server.js` line 367:
```javascript
"-q:v", "1",  // Better quality (1-5 range)
```

#### Change Resolution
In `server.js` line 341:
```javascript
"-video_size", "1280x720",  // Higher resolution
```

#### Adjust Detection Confidence
In `.env`:
```bash
ROBOFLOW_CONFIDENCE=0.7  # Only high-confidence detections
```

### Status Check
```javascript
// In browser console
fetch('http://localhost:3001/api/status').then(r => r.json()).then(console.log)

// Expected output:
// { isProcessing: true, frameCount: 42, clients: 3 }
```

### Health Check
```bash
curl http://localhost:3001/health
# {"status":"ok","videoExists":true,"isProcessing":true,"clients":1}
```

### What's New Compared to Video Streaming
| Feature | Video File | Webcam |
|---------|-----------|--------|
| Source | .mp4 file | Live camera |
| Duration | Fixed length | Continuous |
| Latency | ~1000ms | ~500-2500ms |
| FPS | Variable | Fixed 1 fps inference |
| Start/Stop | UI buttons | UI buttons |
| API Calls | Per frame | Per second |
| Total Bandwidth | Lower | ~1-2 Mbps |

### Next Steps After Setup
1. ✅ Verify camera connected
2. ✅ Add user to video group
3. ✅ Run backend: `npm start`
4. ✅ Open Webcam tab in UI
5. ✅ Click "Start Webcam"
6. ✅ See MJPEG stream + detections
7. ✅ Monitor console logs
8. ✅ Check WebSocket events
9. ✅ Run test script
10. ✅ Customize configuration as needed

### Support Resources
- Browser DevTools (F12) for debugging
- Server logs for FFmpeg/API errors
- `/health` endpoint for system status
- `test-webcam-feature.sh` for automated testing
- Documentation files for detailed info

---

**Last Updated**: February 11, 2026  
**Feature Status**: ✅ Production Ready  
**All Endpoints**: Tested & Working  
**UI Component**: Fully Integrated  
**Documentation**: Comprehensive  
