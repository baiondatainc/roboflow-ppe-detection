# Webcam Feature Setup Guide

## Quick Start

### 1. Prerequisites
Ensure you have:
- FFmpeg installed with v4l2 support
- A webcam connected to `/dev/video0`
- Backend running on `localhost:3001`
- Vue frontend accessible

### 2. Verify Webcam Access
```bash
# Check if camera exists
ls -l /dev/video0

# If permission denied, add your user to video group
sudo usermod -a -G video $USER

# Test FFmpeg with v4l2
ffmpeg -f v4l2 -list_formats all -i /dev/video0
```

### 3. Backend is Ready
The new endpoints are automatically available when you run:
```bash
npm start
# or
node server.js
```

**New Endpoints Added:**
- `GET /webcam` - MJPEG stream from webcam
- `POST /api/start-webcam-processing` - Start PPE detection
- `POST /api/stop-webcam-processing` - Stop PPE detection

### 4. UI is Ready
The Webcam tab appears in the navigation menu:
1. Dashboard
2. **Webcam** ← NEW
3. Live Stream (Video File)
4. Violations

## How to Use

### Step 1: Navigate to Webcam Tab
Click the **Webcam** button (camera icon) in the navigation menu.

### Step 2: Start Processing
Click **"Start Webcam"** button to begin:
- FFmpeg captures from `/dev/video0`
- Frames sent to Roboflow API every 1 second
- WebSocket broadcasts detections in real-time
- Canvas overlay renders bounding boxes

### Step 3: Monitor Detections
- **Live stream**: MJPEG video from your webcam
- **Bounding boxes**: Red/orange overlays with confidence %
- **Detection feed**: List of detected PPE items
- **Status indicator**: Shows connection status and frame count

### Step 4: Stop Processing
Click **"Stop Webcam"** to cleanly shutdown:
- FFmpeg process terminated with SIGTERM
- WebSocket messages stop
- UI returns to idle state

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Vue Frontend                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  WebcamViewer.vue Component                              │   │
│  │  ┌────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ Video HTML │  │ Canvas      │  │ Detection List  │  │   │
│  │  │ Tag        │  │ (Overlays)  │  │ & Stats         │  │   │
│  │  └────────────┘  └─────────────┘  └─────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│         ↓ fetch()         ↓ WebSocket msg       ↑ fetch()        │
└────────┼──────────────────┼────────────────────┼────────────────┘
         │                  │                    │
         ↓                  ↓                    ↓
    ┌──────────────────────────────────────────────────┐
    │          Node.js Backend (server.js)             │
    │  ┌────────────────────────────────────────────┐  │
    │  │  GET /webcam                               │  │
    │  │  - MJPEG streaming endpoint                │  │
    │  │  - Broadcasts JPEG frames with boundary   │  │
    │  ├────────────────────────────────────────────┤  │
    │  │  POST /api/start-webcam-processing        │  │
    │  │  - Spawns FFmpeg process                  │  │
    │  │  - Captures frames from /dev/video0       │  │
    │  ├────────────────────────────────────────────┤  │
    │  │  POST /api/stop-webcam-processing         │  │
    │  │  - Kills FFmpeg process                   │  │
    │  │  - Cleanup                                │  │
    │  ├────────────────────────────────────────────┤  │
    │  │  processWebcamFrame()                      │  │
    │  │  - Sends frame to Roboflow API            │  │
    │  │  - Broadcasts PPE_DETECTION_WEBCAM event  │  │
    │  ├────────────────────────────────────────────┤  │
    │  │  WebSocket: broadcast()                    │  │
    │  │  - Real-time detection events             │  │
    │  └────────────────────────────────────────────┘  │
    └────┬──────────┬──────────┬──────────────────────┘
         │          │          │
         ↓          ↓          ↓
    ┌─────────────────────────────────────────────────┐
    │    FFmpeg (v4l2)       Roboflow API    WebSocket│
    │    /dev/video0   →      API Call    →    Events│
    │    640x480              → 1 fps                 │
    │    15 fps capture       Inference               │
    │    1 fps processing     ~500ms latency         │
    └─────────────────────────────────────────────────┘
```

## Flow Diagram

```
User clicks "Start Webcam"
         ↓
POST /api/start-webcam-processing
         ↓
FFmpeg spawns: ffmpeg -f v4l2 -i /dev/video0 -vf fps=1 ...
         ↓
Frame captured every 1 second
         ↓
processWebcamFrame(frame)
         ↓
axios.post(detect.roboflow.com/...)
         ↓
Predictions received (e.g., 3 detections)
         ↓
For each prediction:
  → broadcast({ eventType: PPE_DETECTION_WEBCAM, ... })
         ↓
WebSocket sends to all connected clients
         ↓
Vue component receives message
         ↓
displayedAnnotations.push(detection)
         ↓
Canvas renders bounding box
         ↓
User sees overlay in real-time
```

## Key Features

✅ **Live Video Streaming**
- MJPEG format for browser compatibility
- No plugin required
- Continuous from /dev/video0

✅ **Real-Time PPE Detection**
- 1 frame per second to Roboflow API
- Instant WebSocket broadcast
- <100ms UI update latency

✅ **Canvas Overlay**
- Bounding boxes with confidence scores
- Color-coded (red=high confidence, orange=medium)
- Real-time statistics panel

✅ **Stream Quality Metrics**
- Detection count tracker
- Last detection timestamp
- Active detection display
- Frame number tracking

✅ **Error Handling**
- Connection status indicator
- Error message display
- Auto-reconnection logic
- Graceful degradation

✅ **Resource Management**
- Memory guard (5MB frame buffer max)
- Auto-cleanup on disconnect
- Graceful process termination

## Troubleshooting

### Issue: Webcam stream shows black/error
**Solution:**
```bash
# Check camera availability
v4l2-ctl --list-devices

# Check camera permissions
ls -l /dev/video*

# Test FFmpeg directly
ffmpeg -f v4l2 -i /dev/video0 -frames:v 1 test.jpg
```

### Issue: No detections appearing
**Solution:**
1. Check browser console for errors (F12)
2. Verify Roboflow API key in `.env`
3. Check network tab for API calls
4. Verify model name and version

### Issue: WebSocket connection failed
**Solution:**
```bash
# Check backend is running
curl http://localhost:3001/health

# Check port 3001 is listening
netstat -tlnp | grep 3001
```

### Issue: FFmpeg permission denied
**Solution:**
```bash
# Add user to video group
sudo usermod -a -G video $USER

# Verify
groups $USER  # Should include 'video'
```

## Environment Variables

Update `.env` file:
```bash
# Existing vars (unchanged)
ROBOFLOW_API_KEY=your_api_key_here
ROBOFLOW_MODEL=your_model_name
ROBOFLOW_VERSION=1
ROBOFLOW_CONFIDENCE=0.5
ROBOFLOW_OVERLAP=0.5
FRAME_SAMPLE_RATE=1

# Optional: Modify camera device in server.js line 342
# "-i", "/dev/video0",  ← Change this if needed
```

## Testing Checklist

- [ ] Backend starts without errors
- [ ] `/health` endpoint returns status=ok
- [ ] Webcam tab appears in navigation
- [ ] "Start Webcam" button is clickable
- [ ] MJPEG stream loads (shows video feed)
- [ ] Frame capture starts (see logs)
- [ ] Roboflow API receives frames (check logs)
- [ ] WebSocket events broadcast (console logs)
- [ ] Canvas overlay renders detections
- [ ] "Stop Webcam" cleanly stops process
- [ ] Error messages display on failures

## Performance Notes

| Metric | Value |
|--------|-------|
| Stream Resolution | 640x480 |
| Capture FPS | 15 fps |
| Processing FPS | 1 fps |
| API Latency | ~500-2000ms |
| Canvas Render | 60 fps |
| Detection History | 20 items max |

## Support

See `WEBCAM_FEATURE.md` for:
- Detailed architecture
- All API endpoints
- WebSocket event formats
- Advanced configuration
- Future enhancements
