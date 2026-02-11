# Webcam Real-Time PPE Detection

This feature enables live PPE (Personal Protective Equipment) detection directly from your webcam using Roboflow's object detection API.

## Architecture Flow

```
Webcam Device (/dev/video0)
    ↓
FFmpeg v4l2 Input (-f v4l2)
    ↓
Extract JPEG Frames (fps=1)
    ↓
Roboflow API (detect.roboflow.com)
    ↓
WebSocket Broadcast (PPE_DETECTION_WEBCAM events)
    ↓
Canvas Overlay Rendering in UI
```

## Backend Implementation

### New Server Endpoints

#### 1. **GET `/webcam`** - MJPEG Stream
Streams live MJPEG frames from the webcam to connected clients.

**Response**: MJPEG stream with boundary headers
```
--boundary
Content-Type: image/jpeg
Content-Length: [size]

[JPEG frame data]
```

#### 2. **POST `/api/start-webcam-processing`** - Start PPE Detection
Starts capturing frames from `/dev/video0` and processing them with Roboflow API.

**Request Body**: None
**Response**:
```json
{
  "success": true,
  "message": "Webcam PPE detection started"
}
```

#### 3. **POST `/api/stop-webcam-processing`** - Stop Detection
Stops the webcam processing and FFmpeg process.

**Request Body**: None
**Response**:
```json
{
  "success": true,
  "message": "Webcam processing stopped"
}
```

### WebSocket Event: `PPE_DETECTION_WEBCAM`
Broadcasted when PPE is detected in a webcam frame.

**Event Format**:
```json
{
  "eventType": "PPE_DETECTION_WEBCAM",
  "source": "webcam",
  "frame": 42,
  "type": "person_without_helmet",
  "confidence": 0.95,
  "boundingBox": {
    "x": 320,
    "y": 240,
    "width": 100,
    "height": 150
  },
  "timestamp": "2026-02-11T12:34:56.789Z"
}
```

## Frontend Implementation

### New Vue Component: `WebcamViewer.vue`

**Features**:
- Live MJPEG stream display from `/webcam` endpoint
- Canvas overlay for bounding box visualization
- Real-time detection rendering
- Processing controls (Start/Stop)
- Detection history with confidence scores
- Streaming status indicator
- Error handling and reconnection logic

**Key Methods**:
- `startProcessing()` - POST to `/api/start-webcam-processing`
- `stopProcessing()` - POST to `/api/stop-webcam-processing`
- `drawAnnotations()` - Render bounding boxes on canvas
- `setupAnnotationListener()` - WebSocket message handler

### Updated App.vue
Added "Webcam" tab to main navigation menu, positioned between Dashboard and Live Stream.

## System Requirements

### Hardware
- USB Webcam or integrated camera
- Device must be available at `/dev/video0`

### Software
- FFmpeg with v4l2 support: `ffmpeg -f v4l2 ...`
- Node.js with Express and WebSocket server
- Vue 3 with responsive canvas rendering

### FFmpeg v4l2 Parameters
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

**Parameters**:
- `-f v4l2`: Video4Linux2 input format
- `-video_size 640x480`: Capture resolution
- `-framerate 15`: Input frame rate (15 fps)
- `-vf fps=1`: Extract 1 frame per second for processing
- `-q:v 2`: JPEG quality (1=best, 31=worst)

## Configuration

### Environment Variables
The existing `.env` file is used:
```bash
ROBOFLOW_API_KEY=your_api_key
ROBOFLOW_MODEL=your_model_name
ROBOFLOW_VERSION=1
ROBOFLOW_CONFIDENCE=0.5
ROBOFLOW_OVERLAP=0.5
```

### Camera Device
Default: `/dev/video0`
To use a different device, modify line in `server.js`:
```javascript
"-i", "/dev/video0",  // Change this
```

## Usage

### Start Backend
```bash
npm start
# Server running at http://localhost:3001
```

### Access UI
```
http://localhost:3001/  (if serving static files)
# OR navigate to your Vue frontend
```

### Start Webcam Streaming
1. Click "Webcam" tab in navigation
2. Click "Start Webcam" button
3. Live stream and detections appear in real-time

### Stop Webcam Streaming
1. Click "Stop Webcam" button
2. FFmpeg process terminates cleanly
3. WebSocket messages stop

## Performance Metrics

| Metric | Value |
|--------|-------|
| Capture Resolution | 640x480 |
| Capture Frame Rate | 15 fps |
| Detection Frame Rate | 1 fps (sampled) |
| Roboflow API Latency | ~500-2000ms |
| WebSocket Broadcast Latency | <100ms |
| Canvas Render FPS | 60 fps (requestAnimationFrame) |

## Error Handling

### Common Issues

**1. "/dev/video0 not found"**
```
Error: Cannot find camera device
Solution: ls /dev/video* to check available devices
         Adjust FFmpeg -i parameter accordingly
```

**2. "Permission denied"**
```
Error: Cannot access /dev/video0
Solution: sudo usermod -a -G video $USER
         Then logout and login
```

**3. "Roboflow API timeout"**
```
Error: 30000ms timeout exceeded
Solution: Check internet connection
         Verify API key in .env
         Check Roboflow service status
```

**4. "WebSocket connection failed"**
```
Error: Cannot connect to ws://localhost:3001
Solution: Ensure backend is running
         Check port 3001 availability
         Verify CORS configuration
```

## Memory Management

- **Frame Buffer**: Max 5MB before purge
- **Detection History**: Last 20 detections kept in UI
- **WebSocket Clients**: Auto-cleanup on disconnect
- **FFmpeg Process**: Graceful SIGTERM on stop

## File Structure

```
backend/
  server.js                    # New webcam endpoints + WebSocket broadcasting
vision-ui/
  src/
    components/
      WebcamViewer.vue         # NEW: Webcam streaming UI
      StreamViewer.vue         # Existing video file streaming
      Dashboard.vue
      ViolationFeed.vue
    App.vue                    # Updated with Webcam tab
```

## Testing

### Manual Testing Checklist
- [ ] Webcam device detected at startup
- [ ] FFmpeg successfully opens /dev/video0
- [ ] MJPEG stream loads in browser
- [ ] Roboflow API receives frames
- [ ] WebSocket broadcasts detection events
- [ ] Canvas overlay renders bounding boxes
- [ ] Stop button cleanly terminates process
- [ ] Error messages display on failure

### Browser Console
Look for logs like:
```
✅ Webcam stream requested
✅ FFmpeg webcam capture started
✅ Got 3 predictions
✅ Detection rendered. Total: 5
```

## Future Enhancements

1. **Multi-camera support** - Handle multiple /dev/videoX devices
2. **Resolution configuration** - UI slider for video size adjustment
3. **Frame rate tuning** - Configurable capture and processing rates
4. **Recording** - Save detected events with bounding boxes
5. **Analytics** - Dashboard with detection statistics
6. **Alert thresholds** - Configurable confidence levels per PPE type
7. **Email/SMS notifications** - Alert on PPE violations
8. **GPU acceleration** - CUDA/OpenCL for faster inference

## Related Documentation

- [FFmpeg v4l2 Documentation](https://trac.ffmpeg.org/wiki/Capture/Webcam)
- [Roboflow Inference API](https://docs.roboflow.com/api-reference/images)
- [WebSocket API MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Canvas Rendering Context API](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)
