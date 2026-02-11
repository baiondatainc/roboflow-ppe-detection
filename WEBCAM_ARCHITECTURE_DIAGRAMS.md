# Webcam Feature - Visual Architecture

## Complete System Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Vue.js Application                            │  │
│  │  ┌──────────────────┐ ┌─────────────────────────────────────────┐  │  │
│  │  │    App.vue       │ │         WebcamViewer.vue               │  │  │
│  │  │  - Navigation    │ │  ┌─────────────────────────────────┐  │  │  │
│  │  │  - Tab Router    │ │  │ Component Setup (onMounted)     │  │  │  │
│  │  │  - Webcam Tab    │ │  │ - checkStreamHealth()           │  │  │  │
│  │  └──────────────────┘ │  │ - setupAnnotationListener()     │  │  │  │
│  │                        │  │ - startRenderLoop()            │  │  │  │
│  │                        │  └─────────────────────────────────┘  │  │  │
│  │                        │                                        │  │  │
│  │                        │  ┌─────────────────────────────────┐  │  │  │
│  │                        │  │     Video Stream Display        │  │  │  │
│  │                        │  │  <img src="/webcam">            │  │  │  │
│  │                        │  │  <canvas id="overlay">          │  │  │  │
│  │                        │  │                                 │  │  │  │
│  │                        │  │  Real-time Rendering:           │  │  │  │
│  │                        │  │  - drawAnnotations()            │  │  │  │
│  │                        │  │  - 60 FPS canvas update         │  │  │  │
│  │                        │  │  - Bounding boxes               │  │  │  │
│  │                        │  │  - Confidence scores            │  │  │  │
│  │                        │  │  - Stats panel                  │  │  │  │
│  │                        │  └─────────────────────────────────┘  │  │  │
│  │                        │                                        │  │  │
│  │                        │  ┌─────────────────────────────────┐  │  │  │
│  │                        │  │    Control Panel                │  │  │  │
│  │                        │  │  [Start] [Stop] Status Badge    │  │  │  │
│  │                        │  │  Detection Counter              │  │  │  │
│  │                        │  │  Source: LIVE CAMERA            │  │  │  │
│  │                        │  └─────────────────────────────────┘  │  │  │
│  │                        │                                        │  │  │
│  │                        │  ┌─────────────────────────────────┐  │  │  │
│  │                        │  │  Detection Feed                 │  │  │  │
│  │                        │  │  [person_without_helmet] 95%   │  │  │  │
│  │                        │  │  [person_without_gloves] 87%   │  │  │  │
│  │                        │  │  [person_without_helmet] 92%   │  │  │  │
│  │                        │  └─────────────────────────────────┘  │  │  │
│  │                        └────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Communication Channels:                                                    │
│  • fetch("http://localhost:3001/api/start-webcam-processing") ───┐        │
│  • fetch("http://localhost:3001/api/stop-webcam-processing")  ───┼────┐   │
│  • <img src="http://localhost:3001/webcam"> ──────────────────┐  │    │   │
│  • WebSocket("ws://localhost:3001") ───────────────────────┐  │  │    │   │
└────────────────────────────────────────────────────────────┼──┼──┼────┼───┘
                                                             │  │  │    │
                                                             │  │  │    │
┌────────────────────────────────────────────────────────────┼──┼──┼────┼────┐
│                         NODE.JS SERVER                     │  │  │    │    │
│  (server.js)                                              │  │  │    │    │
│                                                            │  │  │    │    │
│  ┌──────────────────────────────────────────────────────┐ │  │  │    │    │
│  │  HTTP Endpoints                                      │ │  │  │    │    │
│  │                                                      │ │  │  │    │    │
│  │  POST /api/start-webcam-processing ◄────────────────┼──┘  │    │    │
│  │  ├─ isProcessingWebcam = true                       │     │    │    │
│  │  ├─ Spawn FFmpeg process                            │     │    │    │
│  │  └─ Return { success: true }                        │     │    │    │
│  │                                                      │     │    │    │
│  │  POST /api/stop-webcam-processing ◄──────────────────────┘    │    │
│  │  ├─ isProcessingWebcam = false                      │          │    │
│  │  ├─ Kill FFmpeg process                            │          │    │
│  │  └─ Return { success: true }                        │          │    │
│  │                                                      │          │    │
│  │  GET /webcam ◄──────────────────────────────────────┴──────────┘    │
│  │  ├─ Set headers: multipart/x-mixed-replace          │               │
│  │  ├─ Register frameHandler callback                  │               │
│  │  ├─ Add to webcamClients2 Set                       │               │
│  │  └─ Stream MJPEG frames with boundaries             │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │  FFmpeg Process Manager                              │               │
│  │                                                      │               │
│  │  spawn("ffmpeg", [                                  │               │
│  │    "-f", "v4l2",                   # Video4Linux2   │               │
│  │    "-video_size", "640x480",       # Resolution     │               │
│  │    "-framerate", "15",             # Input FPS      │               │
│  │    "-i", "/dev/video0",            # Webcam device  │               │
│  │    "-vf", "fps=1",                 # Sample rate    │               │
│  │    "-f", "image2pipe",             # Output format  │               │
│  │    "-vcodec", "mjpeg",             # JPEG encoding  │               │
│  │    "-q:v", "2",                    # Quality        │               │
│  │    "-"                             # Stdout pipe    │               │
│  │  ])                                                 │               │
│  │                                                      │               │
│  │  stdout.on("data", chunk => {                       │               │
│  │    buffer = concat(buffer, chunk)  # Accumulate     │               │
│  │    while (endMarker found) {                        │               │
│  │      frame = extract(buffer)       # Extract frame  │               │
│  │      broadcastWebcamFrame(frame)   # Send MJPEG ────┼───────────┐   │
│  │      processWebcamFrame(frame) ────┼────────────┐   │           │   │
│  │    }                                            │   │           │   │
│  │  })                                             │   │           │   │
│  └──────────────────────────────────────────────────┼───┼───────────┤   │
│                                                     │   │           │   │
│  ┌──────────────────────────────────────────────────┴──────┐       │   │
│  │  Roboflow Inference Function                   │        │       │   │
│  │  processWebcamFrame(imageBuffer)               │        │       │   │
│  │                                                │        │       │   │
│  │  1. Create FormData with JPEG               │        │       │   │
│  │  2. axios.post("https://detect.roboflow.com/")      │       │   │
│  │     ├─ params: api_key, confidence, overlap         │       │   │
│  │     ├─ Roboflow API processes frame       ──────────┼───────┘   │   │
│  │     └─ Returns: { predictions: [...] }             │           │   │
│  │  3. For each prediction:                           │           │   │
│  │     └─ broadcast({ eventType: PPE_DETECTION_WEBCAM })           │   │
│  │  4. Error handling and logging                      │           │   │
│  └───────────────────────────────────────────────────────┘       │   │
│                                                                   │   │
│  ┌──────────────────────────────────────────────────────┐         │   │
│  │  WebSocket Server (wss)                             │         │   │
│  │                                                     │         │   │
│  │  broadcast(data) ◄──────────────────────────────────┼─────────┘   │
│  │  ├─ clients.forEach(ws => {                         │             │
│  │  │   ws.send(JSON.stringify({                       │             │
│  │  │     eventType: "PPE_DETECTION_WEBCAM",           │             │
│  │  │     source: "webcam",                            │             │
│  │  │     frame: 42,                                   │             │
│  │  │     type: "person_without_helmet",               │             │
│  │  │     confidence: 0.95,                            │             │
│  │  │     boundingBox: {...},                          │             │
│  │  │     timestamp: "2026-02-11T12:34:56.789Z"        │             │
│  │  │   }))                                            │             │
│  │  │ })                                               │             │
│  │  └─ Send to ALL connected clients (broadcast) ──────┼─────────────┘
│  └──────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────────────────────────┘
```

## Sequential Flow Diagram

```
USER ACTION                         BACKEND                         ROBOFLOW API

 Start Click
      │
      ├─POST /api/start-webcam-processing
      │         │
      │         ├─ Set isProcessingWebcam = true
      │         │
      │         ├─ Spawn FFmpeg process
      │         │         │
      │         │         └─ Connect to /dev/video0
      │         │         └─ Begin capturing frames
      │         │
      │         ├─ Setup stdout stream handler
      │         │
      │         └─ Return 200 OK { success: true }
      │
      │ ──────────────────────────────────────────────────
      │
      │ [Continuous Processing During Active Stream]
      │
      │         Every 1 second:
      │         ├─ Extract JPEG frame from FFmpeg buffer
      │         │
      │         ├─ broadcastWebcamFrame(frame)
      │         │  └─ Send to all /webcam clients via MJPEG
      │         │
      │         └─ processWebcamFrame(frame)
      │            │
      │            ├─ Create FormData with JPEG
      │            │
      │            ├─ POST /detect API
      │            │         │
      │            │         ├─ Inference running...
      │            │         │
      │            │         └─ Return predictions
      │            │
      │            ├─ Parse predictions
      │            │
      │            ├─ For each detection:
      │            │  └─ broadcast({ PPE_DETECTION_WEBCAM })
      │            │        │
      │            │        └─ Send via WebSocket to UI
      │            │
      │            └─ Log results
      │
      │ Canvas receives WebSocket event
      │      │
      │      └─ drawAnnotations()
      │         └─ requestAnimationFrame loop renders
      │            bounding boxes at 60 FPS
      │
      │ ──────────────────────────────────────────────────
      │
      │ Stop Click
      │      │
      │      ├─POST /api/stop-webcam-processing
      │      │         │
      │      │         ├─ Set isProcessingWebcam = false
      │      │         │
      │      │         ├─ FFmpeg.kill("SIGTERM")
      │      │         │  └─ Graceful shutdown
      │      │         │
      │      │         ├─ Clear references
      │      │         │
      │      │         └─ Return 200 OK { success: true }
      │      │
      │      └─ UI updates to IDLE state
```

## State Diagram

```
              ┌─────────────────────────────────────────┐
              │                                         │
              │            IDLE STATE                   │
              │  - isProcessingWebcam: false            │
              │  - ffmpegProcess: null                  │
              │  - frameCount: 0                        │
              │  - UI: "Start Webcam" button visible    │
              │                                         │
              └────────────┬────────────────────────────┘
                           │
                User clicks "Start Webcam"
                           │
                           ▼
              ┌─────────────────────────────────────────┐
              │                                         │
              │          STARTING STATE                 │
              │  - Spawn FFmpeg process                 │
              │  - Setup stream handlers                │
              │  - Setup WebSocket listeners            │
              │                                         │
              └────────────┬────────────────────────────┘
                           │
                  FFmpeg connected, 
                  first frame captured
                           │
                           ▼
              ┌─────────────────────────────────────────┐
              │                                         │
              │        PROCESSING STATE                 │
              │  - isProcessingWebcam: true             │
              │  - FFmpeg streaming from /dev/video0    │
              │  - Roboflow API inference every 1 sec   │
              │  - WebSocket broadcasting detections    │
              │  - Canvas rendering at 60 FPS           │
              │  - UI: "Stop Webcam" button visible     │
              │                                         │
              │  Metrics:                               │
              │  - frameCount: incrementing             │
              │  - detectionCount: updating             │
              │  - lastDetectionTime: current           │
              │                                         │
              └────────────┬────────────────────────────┘
                           │
                User clicks "Stop Webcam"
                           │
                           ▼
              ┌─────────────────────────────────────────┐
              │                                         │
              │          STOPPING STATE                 │
              │  - Send SIGTERM to FFmpeg               │
              │  - Clear client handlers                │
              │  - Close WebSocket connections          │
              │  - Stop inference                       │
              │                                         │
              └────────────┬────────────────────────────┘
                           │
                    Process terminated,
                    all resources cleaned
                           │
                           ▼
              ┌─────────────────────────────────────────┐
              │                                         │
              │            IDLE STATE                   │
              │  (Return to initial state)              │
              │                                         │
              └─────────────────────────────────────────┘
```

## Data Flow for Single Detection

```
FRAME CAPTURED FROM WEBCAM
        │
        ├─ Resolution: 640x480
        ├─ Format: YUV420 (raw camera data)
        └─ Size: ~460KB uncompressed
        
        ▼
        
FFMPEG PROCESSES
        │
        ├─ Encode to JPEG
        └─ Quality: q:v=2 (high quality)
        
        ├─ Size: ~50-100KB compressed
        ├─ Processed in real-time
        └─ Buffer accumulation handled
        
        ▼
        
JAVASCRIPT BUFFER HANDLING
        │
        ├─ Detect JPEG boundaries (0xFFD9)
        ├─ Extract complete frame
        ├─ Remove from buffer
        └─ Memory guard: Max 5MB
        
        ▼
        
TWO PARALLEL PATHS:
        
        PATH 1: MJPEG STREAMING
        │
        ├─ broadcastWebcamFrame(frame)
        │
        ├─ For each /webcam client:
        │  │
        │  └─ Write MJPEG boundary
        │     └─ Write Content-Type: image/jpeg
        │     └─ Write Content-Length
        │     └─ Write JPEG data
        │
        └─ Browser receives: 15 FPS stream
        
        
        PATH 2: PPE DETECTION (1 FPS sampled)
        │
        ├─ processWebcamFrame(imageBuffer)
        │
        ├─ Create FormData
        │  └─ Append JPEG file
        │
        ├─ axios.post("https://detect.roboflow.com/MODEL/VERSION")
        │  ├─ API Key: from .env
        │  ├─ Confidence: 0.5 (from .env)
        │  ├─ Overlap: 0.5 (from .env)
        │  └─ Timeout: 30s
        │
        ├─ WAIT FOR RESPONSE: ~500-2000ms
        │
        ├─ Response: { predictions: [...] }
        │  └─ predictions[0]:
        │     ├─ class: "person_without_helmet"
        │     ├─ x: 320 (center X)
        │     ├─ y: 240 (center Y)
        │     ├─ width: 100
        │     ├─ height: 150
        │     └─ confidence: 0.95
        │
        ├─ For each prediction:
        │
        └─ broadcast({ eventType: PPE_DETECTION_WEBCAM, ...})
           │
           ├─ JSON.stringify() detection object
           │
           ├─ Send via WebSocket to all connected clients
           │
           └─ Clients receive in <100ms
        

BROWSER RECEIVES MJPEG FRAME (15 FPS)
        │
        ├─ <img src="/webcam"> loads continuously
        │
        └─ NEVER WAIT: Display most recent frame
        

BROWSER RECEIVES WEBSOCKET EVENT
        │
        ├─ socket.addEventListener("message", handler)
        │
        ├─ Parse detection JSON
        │
        ├─ Add to displayedAnnotations[]
        │
        └─ requestAnimationFrame loop sees new data
        

CANVAS RENDER (60 FPS requestAnimationFrame)
        │
        ├─ drawAnnotations()
        │  ├─ For each annotation in displayedAnnotations[]:
        │  │  ├─ Calculate pixel positions
        │  │  │  └─ x_pixel = (box.x / 100) * canvas.width
        │  │  ├─ Draw rectangle outline
        │  │  │  └─ Color: #ef4444 (high confidence)
        │  │  │  └─ Color: #f59e0b (medium confidence)
        │  │  ├─ Draw label background
        │  │  │  └─ "person_without_helmet"
        │  │  ├─ Draw confidence %
        │  │  │  └─ "95%"
        │  │  └─ Draw stats panel
        │  │     ├─ Total detections
        │  │     ├─ Active detections
        │  │     └─ Time since last detection
        │  │
        │  └─ Next frame update at 60 FPS
        │
        └─ USER SEES REAL-TIME OVERLAYS
        

DETECTION HISTORY
        │
        ├─ Keep last 20 detections
        ├─ Display in detection feed
        ├─ Show timestamp
        ├─ Show confidence score
        └─ Auto-scroll to latest
```

## Memory Layout

```
┌─ SERVER PROCESS ─────────────────────────────────────────┐
│                                                           │
│  ┌─ Global Variables ─────────────────────────────────┐ │
│  │ const app = express()                              │ │
│  │ const wss = WebSocketServer({ server })            │ │
│  │ const clients = new Set()                          │ │
│  │ const webcamClients2 = new Set()                   │ │
│  │ let webcamProcess = null                           │ │
│  │ let isProcessingWebcam = false                     │ │
│  │ let webcamFrameCount = 0                           │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─ Per Active Session ───────────────────────────────┐ │
│  │                                                    │ │
│  │  FFmpeg Child Process:                             │ │
│  │  ├─ PID: 12345                                    │ │
│  │  ├─ Memory: ~100-200MB (FFmpeg + camera driver)  │ │
│  │  ├─ File Handles: /dev/video0                    │ │
│  │  └─ Threads: 2-4 (encoding threads)              │ │
│  │                                                    │ │
│  │  Frame Buffer (Node.js):                           │ │
│  │  ├─ Max size: 5MB                                 │ │
│  │  ├─ Typical: 500KB-1MB                            │ │
│  │  └─ Auto-purged: buffer.alloc(0)                 │ │
│  │                                                    │ │
│  │  WebSocket Clients (Set):                          │ │
│  │  ├─ /webcam clients: 1-10 concurrent             │ │
│  │  ├─ Per client: 10KB overhead                    │ │
│  │  └─ Frame handlers: 1 callback per client        │ │
│  │                                                    │ │
│  │  Roboflow Requests (in-flight):                    │ │
│  │  ├─ 1-2 concurrent requests (1 per second)       │ │
│  │  ├─ Per request: 50-100KB (JPEG)                 │ │
│  │  └─ Response buffer: ~10KB (predictions JSON)    │ │
│  │                                                    │ │
│  │  Total Memory Per Session: ~250-350MB             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
└───────────────────────────────────────────────────────────┘

┌─ BROWSER PROCESS ──────────────────────────────────────┐
│                                                         │
│  ┌─ Vue Component State ─────────────────────────────┐ │
│  │ displayedAnnotations: ref([])  # Max 20 items   │ │
│  │   └─ Per item: ~300 bytes                        │ │
│  │   └─ Max total: ~6KB                             │ │
│  │ detectionCount: ref(0)                           │ │
│  │ lastDetectionTime: ref(null)                     │ │
│  │ isProcessing: ref(false)                         │ │
│  │ streamStatus: ref("connected")                   │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ DOM Elements ────────────────────────────────────┐ │
│  │ <img src="/webcam"> (streaming MJPEG)            │ │
│  │   └─ Decoded frame: 640x480x3 = ~900KB RAM       │ │
│  │   └─ Browser caches 2-4 frames: ~2-4MB           │ │
│  │                                                   │ │
│  │ <canvas id="overlay">                             │ │
│  │   └─ Pixel data: 640x480x4 = ~1.2MB              │ │
│  │   └─ ImageData: ~1.2MB                           │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ WebSocket Connection ────────────────────────────┐ │
│  │ ws://localhost:3001                               │ │
│  │ Message buffer: ~10KB (pending messages)          │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  Total Browser Memory: ~4-6MB (with video + canvas)   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Network Traffic Analysis

```
MJPEG Stream (GET /webcam):
├─ Continuous connection
├─ Frame size: 50-100KB each
├─ Frame rate: 15 FPS (capture) to 1-5 FPS (browser load)
├─ Bandwidth: 15 * 75KB = ~1.1 Mbps
├─ Protocol: HTTP/1.1 persistent connection
└─ Latency: <200ms per frame

Roboflow API Inference:
├─ Frequency: 1 per second
├─ Request size: 50-100KB (JPEG)
├─ Response size: 2-5KB (JSON predictions)
├─ Latency: 500-2000ms
├─ Protocol: HTTPS
└─ Bandwidth: ~100KB/sec

WebSocket Detection Events:
├─ Frequency: 0-10 per second (depends on detections)
├─ Message size: 500B-1KB per event
├─ Bandwidth: ~1-5 KB/sec
├─ Latency: <100ms
└─ Protocol: WebSocket (persistent connection)

Total Bandwidth:
├─ MJPEG: ~1-2 Mbps
├─ Roboflow: ~100 KB/sec
├─ WebSocket: ~5 KB/sec
└─ TOTAL: ~1-2 Mbps (dominated by MJPEG stream)
```

This documentation provides a complete visual understanding of how the webcam feature integrates with the backend and frontend systems.
