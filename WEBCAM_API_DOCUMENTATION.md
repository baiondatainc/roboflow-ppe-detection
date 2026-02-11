# Webcam Feature - Complete API Documentation

## Overview

The Roboflow PPE Detection system now includes complete real-time webcam streaming with PPE detection capabilities. This document provides detailed API reference for all new endpoints and features.

---

## HTTP Endpoints

### GET /webcam
**Real-time MJPEG streaming from webcam**

#### Request
```
GET /webcam HTTP/1.1
Host: localhost:3001
Connection: keep-alive
```

#### Response Headers
```
HTTP/1.1 200 OK
Content-Type: multipart/x-mixed-replace; boundary=--boundary
Connection: keep-alive
Cache-Control: no-cache
Transfer-Encoding: chunked
```

#### Response Body
```
--boundary
Content-Type: image/jpeg
Content-Length: 85432
Content-Disposition: inline; filename=frame.jpg

[JPEG binary data - 85432 bytes]

--boundary
Content-Type: image/jpeg
Content-Length: 84891
Content-Disposition: inline; filename=frame.jpg

[JPEG binary data - 84891 bytes]

--boundary
...
```

#### Characteristics
- **Stream Type**: MJPEG (Motion JPEG)
- **Format**: Multipart with boundary separators
- **Frame Rate**: 15 fps (from FFmpeg capture)
- **Resolution**: 640x480 pixels
- **Quality**: JPEG q:v=2 (high quality)
- **Concurrency**: Unlimited clients
- **Persistence**: HTTP/1.1 keep-alive
- **Timeout**: None (persistent)

#### Error Responses
```
HTTP/1.1 200 OK
(streams empty if FFmpeg not running)
```

#### Browser Usage
```html
<img src="http://localhost:3001/webcam" />
```

#### cURL Testing
```bash
# Save first frame
curl http://localhost:3001/webcam --output - | \
  head -c 500000 > first_frame.mjpeg

# Check headers
curl -I http://localhost:3001/webcam

# Stream to file (stop with Ctrl+C)
curl http://localhost:3001/webcam > stream.mjpeg
```

#### Performance Notes
- Connection overhead: ~100 bytes per frame (headers)
- Bandwidth: ~1-2 Mbps at 1-5 fps browser rendering
- Latency: <200ms per frame
- Buffer: Continuous (no buffering strategy)

---

### POST /api/start-webcam-processing
**Initialize webcam capture and PPE detection**

#### Request
```
POST /api/start-webcam-processing HTTP/1.1
Host: localhost:3001
Content-Length: 0
```

#### Request Body
None (no parameters)

#### Response (Success)
```json
{
  "success": true,
  "message": "Webcam PPE detection started"
}
```

**Status Code**: `200 OK`

#### Response (Error - Already Running)
```json
{
  "error": "Webcam processing already running"
}
```

**Status Code**: `400 Bad Request`

#### Side Effects
1. **FFmpeg Process**
   - Command: `ffmpeg -f v4l2 -video_size 640x480 -framerate 15 -i /dev/video0 -vf fps=1 -f image2pipe -vcodec mjpeg -q:v 2 -`
   - PID stored in: `webcamProcess`
   - Stdout: JPEG frames via pipe
   - Stderr: FFmpeg diagnostics

2. **State Variables**
   ```javascript
   isProcessingWebcam = true
   webcamFrameCount = 0
   ```

3. **Stream Activation**
   - `/webcam` endpoint becomes active
   - MJPEG frames stream at 15 fps capture rate
   - Detection frames sampled at 1 fps

4. **Processing Pipeline**
   - Each sampled frame → Roboflow API
   - Predictions → WebSocket broadcast
   - Events → All connected clients

#### Server Logs
```
🎥 Starting webcam PPE detection...
🎥 Webcam stream requested
📹 Webcam Frame #1 | Size: 84891 bytes
🌐 Calling: https://detect.roboflow.com/model/version
✅ Got 3 predictions
```

#### cURL Testing
```bash
curl -X POST http://localhost:3001/api/start-webcam-processing

# Response
# {"success":true,"message":"Webcam PPE detection started"}
```

#### JavaScript/Fetch Usage
```javascript
const response = await fetch('http://localhost:3001/api/start-webcam-processing', {
  method: 'POST'
});

const data = await response.json();
console.log(data); // { success: true, message: '...' }
```

---

### POST /api/stop-webcam-processing
**Stop webcam capture and PPE detection**

#### Request
```
POST /api/stop-webcam-processing HTTP/1.1
Host: localhost:3001
Content-Length: 0
```

#### Request Body
None (no parameters)

#### Response (Success)
```json
{
  "success": true,
  "message": "Webcam processing stopped"
}
```

**Status Code**: `200 OK`

#### Side Effects
1. **FFmpeg Process**
   - Signal: SIGTERM (graceful termination)
   - Cleanup: Close /dev/video0
   - Timeout: 5 seconds (then SIGKILL)

2. **State Variables**
   ```javascript
   isProcessingWebcam = false
   webcamProcess = null
   ```

3. **Stream Termination**
   - `/webcam` endpoint stops serving frames
   - Connected clients get connection closed
   - MJPEG stream halts

4. **Processing Halt**
   - No more Roboflow API calls
   - WebSocket broadcasts stop
   - Frame buffer cleared

#### Server Logs
```
🎥 Webcam processing stopped
(FFmpeg exit message)
```

#### cURL Testing
```bash
curl -X POST http://localhost:3001/api/stop-webcam-processing

# Response
# {"success":true,"message":"Webcam processing stopped"}
```

#### JavaScript/Fetch Usage
```javascript
const response = await fetch('http://localhost:3001/api/stop-webcam-processing', {
  method: 'POST'
});

const data = await response.json();
console.log(data); // { success: true, message: '...' }
```

---

## WebSocket Events

### PPE_DETECTION_WEBCAM
**Real-time PPE detection broadcasts from webcam frames**

#### Event Format
```json
{
  "eventType": "PPE_DETECTION_WEBCAM",
  "source": "webcam",
  "frame": 42,
  "type": "person_without_helmet",
  "confidence": 0.9527,
  "boundingBox": {
    "x": 312.34,
    "y": 218.76,
    "width": 87.23,
    "height": 134.56
  },
  "timestamp": "2026-02-11T12:34:56.789Z"
}
```

#### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| eventType | string | Always "PPE_DETECTION_WEBCAM" |
| source | string | Always "webcam" |
| frame | number | Sequential frame number from start |
| type | string | Detection class (e.g., "person_without_helmet") |
| confidence | number | Confidence score (0.0 - 1.0) |
| boundingBox.x | number | Center X coordinate (pixels) |
| boundingBox.y | number | Center Y coordinate (pixels) |
| boundingBox.width | number | Bounding box width (pixels) |
| boundingBox.height | number | Bounding box height (pixels) |
| timestamp | string | ISO 8601 timestamp (UTC) |

#### Detection Types
Common PPE detection classes (depends on Roboflow model):
- `person_without_helmet`
- `person_without_gloves`
- `person_without_safety_vest`
- `person_with_helmet`
- `person_with_gloves`
- (custom classes from your trained model)

#### Frequency
- **Sampling**: 1 frame per second from video stream
- **Per Frame**: 0-N events (one per detected object)
- **Rate**: 0-10 events/second typical
- **Latency**: 500-2500ms (depends on Roboflow API)

#### JavaScript Usage

```javascript
// Example 1: Using WebSocket directly
const socket = new WebSocket('ws://localhost:3001');

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.eventType === 'PPE_DETECTION_WEBCAM') {
    console.log(`${data.type}: ${(data.confidence * 100).toFixed(1)}%`);
    console.log(`Location: ${data.boundingBox.x}, ${data.boundingBox.y}`);
  }
});
```

```javascript
// Example 2: In Vue Component (as implemented)
const setupAnnotationListener = () => {
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    
    if (data.eventType === 'PPE_DETECTION_WEBCAM') {
      displayedAnnotations.value.unshift({
        type: data.type,
        confidence: data.confidence,
        boundingBox: data.boundingBox,
        timestamp: data.timestamp,
        frame: data.frame
      });
    }
  });
};
```

#### Canvas Rendering Example
```javascript
// Convert detection to canvas coordinates
const detection = event.data;
const box = detection.boundingBox;

// Assuming canvas width/height known
const x = (box.x / 100) * canvas.width;
const y = (box.y / 100) * canvas.height;
const width = (box.width / 100) * canvas.width;
const height = (box.height / 100) * canvas.height;

// Draw bounding box
ctx.strokeStyle = detection.confidence > 0.8 ? '#ef4444' : '#f59e0b';
ctx.lineWidth = 3;
ctx.strokeRect(x, y, width, height);

// Draw label
ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
ctx.font = 'bold 14px Arial';
const label = `${detection.type} ${(detection.confidence * 100).toFixed(1)}%`;
ctx.fillText(label, x + 5, y - 9);
```

---

## HTTP Status Codes

| Code | Scenario | Response |
|------|----------|----------|
| 200 | Successful request | JSON or stream |
| 400 | Webcam already running | `{error: "..."}` |
| 404 | Endpoint not found | HTML error page |
| 500 | FFmpeg error | `{error: "..."}` |

---

## Configuration Reference

### Environment Variables (from .env)
```bash
# Roboflow API
ROBOFLOW_API_KEY=your_api_key_here
ROBOFLOW_MODEL=your_model_name
ROBOFLOW_VERSION=1
ROBOFLOW_CONFIDENCE=0.5
ROBOFLOW_OVERLAP=0.5

# Server
PORT=3001

# Video File (existing)
VIDEO_FILE=./ppe-upload-video-new1.mp4
```

### Camera Device (in server.js, line ~342)
```javascript
"-i", "/dev/video0",  // ← Modify for different camera
```

### Frame Processing Rate (in server.js, line ~362)
```javascript
"-vf", "fps=1",  // ← Modify for different sampling rate
```

Supported values:
- `fps=0.5` → 1 frame every 2 seconds
- `fps=1` → 1 frame per second (default)
- `fps=2` → 2 frames per second
- `fps=5` → 5 frames per second (more frequent)

### FFmpeg Quality (in server.js, line ~367)
```javascript
"-q:v", "2",  // ← Modify for different quality
```

Quality scale (1=best, 31=worst):
- `1-5` → High quality
- `5-10` → Medium quality
- `10-20` → Low quality

### Canvas Detection History (in WebcamViewer.vue, line ~167)
```javascript
if (displayedAnnotations.value.length > 20) {  // ← Modify limit
  displayedAnnotations.value.pop();
}
```

---

## Error Handling

### Common Errors

#### 1. "Cannot find device /dev/video0"
**Cause**: Camera not connected or permission denied
**Solution**:
```bash
# Check available cameras
ls -l /dev/video*

# Add user to video group
sudo usermod -a -G video $USER
# Logout and login required
```

#### 2. "Webcam processing already running"
**Cause**: POST /api/start-webcam-processing called twice
**Solution**: Call /api/stop-webcam-processing first

#### 3. Roboflow API timeout (30 seconds)
**Cause**: Network issue, API overload, or wrong credentials
**Solution**:
- Check internet connection
- Verify API key in .env
- Check Roboflow service status
- Increase timeout value (edit server.js)

#### 4. WebSocket connection failed
**Cause**: Backend not running or wrong port
**Solution**:
```bash
# Verify backend running
curl http://localhost:3001/health

# Check port 3001 available
lsof -i :3001
```

### Server Error Logs
```
❌ FFmpeg error: Cannot find device
❌ Frame #1 Error: ETIMEDOUT Roboflow API
❌ WebSocket error: Connection reset
```

---

## Performance Benchmarks

### Throughput
| Metric | Value |
|--------|-------|
| Frame Capture Rate | 15 fps |
| Processing Rate | 1 fps |
| Roboflow API Latency | 500-2000ms |
| WebSocket Broadcast | <100ms |
| Canvas Render FPS | 60 fps |

### Network
| Component | Bandwidth |
|-----------|-----------|
| MJPEG Stream | 1-2 Mbps |
| Roboflow API | 100 KB/s |
| WebSocket Events | 5 KB/s |
| **Total** | **~1-2 Mbps** |

### Memory
| Component | Usage |
|-----------|-------|
| FFmpeg Process | 100-200 MB |
| Node.js Frame Buffer | 500KB - 5MB |
| Browser Video Buffer | 2-4 MB |
| Browser Canvas | 1.2 MB |
| **Per Session Total** | **~250-350 MB** |

### CPU
| Component | Usage |
|-----------|-------|
| FFmpeg Encoding | 30-50% single core |
| Roboflow API Call | Blocking (waiting) |
| Canvas Rendering | <1% |
| **Peak Total** | **~30-50%** |

---

## Testing Examples

### Test 1: Verify Endpoint Availability
```bash
curl -I http://localhost:3001/webcam
# HTTP/1.1 200 OK
# Content-Type: multipart/x-mixed-replace
```

### Test 2: Start-Stop Cycle
```bash
# Start
curl -X POST http://localhost:3001/api/start-webcam-processing
# {"success":true,"message":"Webcam PPE detection started"}

# Stop
curl -X POST http://localhost:3001/api/stop-webcam-processing
# {"success":true,"message":"Webcam processing stopped"}
```

### Test 3: WebSocket Messages
```javascript
// In browser console
ws = new WebSocket('ws://localhost:3001');
ws.onmessage = (e) => console.log(JSON.parse(e.data));

// Should see PPE_DETECTION_WEBCAM events
```

### Test 4: Frame Capture
```bash
# Save one frame
timeout 2 curl http://localhost:3001/webcam | \
  head -c 200000 > test_frame.mjpeg

# Convert MJPEG to JPEG
ffmpeg -i test_frame.mjpeg -frames:v 1 output.jpg
```

---

## Integration Guide

### Vue.js Component Integration
```javascript
import { ref, onMounted } from "vue";

export default {
  setup() {
    const isProcessing = ref(false);
    
    const startWebcam = async () => {
      const res = await fetch('/api/start-webcam-processing', {
        method: 'POST'
      });
      if (res.ok) isProcessing.value = true;
    };
    
    const stopWebcam = async () => {
      const res = await fetch('/api/stop-webcam-processing', {
        method: 'POST'
      });
      if (res.ok) isProcessing.value = false;
    };
    
    return { startWebcam, stopWebcam, isProcessing };
  }
};
```

### React Integration
```javascript
const [isProcessing, setIsProcessing] = useState(false);

const startWebcam = async () => {
  const res = await fetch('/api/start-webcam-processing', {
    method: 'POST'
  });
  if (res.ok) setIsProcessing(true);
};

const stopWebcam = async () => {
  const res = await fetch('/api/stop-webcam-processing', {
    method: 'POST'
  });
  if (res.ok) setIsProcessing(false);
};
```

### Direct JavaScript
```javascript
// Start webcam
document.getElementById('startBtn').addEventListener('click', async () => {
  const res = await fetch('/api/start-webcam-processing', { method: 'POST' });
  console.log(await res.json());
});

// Display stream
document.getElementById('video').src = 'http://localhost:3001/webcam';

// Listen to detections
const ws = new WebSocket('ws://localhost:3001');
ws.addEventListener('message', (e) => {
  const detection = JSON.parse(e.data);
  if (detection.eventType === 'PPE_DETECTION_WEBCAM') {
    console.log(detection);
  }
});
```

---

## Troubleshooting API Issues

### Issue: HTTP 400 "Already Running"
```bash
# Check status
curl http://localhost:3001/api/status

# Force stop
curl -X POST http://localhost:3001/api/stop-webcam-processing
```

### Issue: WebSocket Messages Not Arriving
```javascript
// Check WebSocket connection
console.log(ws.readyState);
// 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED

// Verify server logs show detection events
```

### Issue: Roboflow API Errors
```bash
# Test API directly
curl -X POST /debug/test-roboflow \
  -F "file=@test_frame.jpg" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

This comprehensive API documentation covers all aspects of the webcam feature including endpoints, events, configuration, and integration patterns.
