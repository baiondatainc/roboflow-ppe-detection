<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import {
  WebSocketService,
  DetectionService,
  CanvasRenderer,
  APIService,
  StreamHealthMonitor,
  FPSCounter
} from "../services/index.js";

// Service instances
const apiService = new APIService();
const detectionService = new DetectionService();
const canvasRenderer = new CanvasRenderer();
const streamHealthMonitor = new StreamHealthMonitor({ apiService });
const fpsCounter = new FPSCounter();
const websocketService = new WebSocketService();

// Component state
const imageElement = ref(null);
const canvasElement = ref(null);
const streamStatus = ref("connecting");
const displayedAnnotations = ref([]);
const isProcessing = ref(false);
const processingError = ref("");
const detectionCount = ref(0);
const lastDetectionTime = ref(null);

// Frame dimensions
const frameWidth = ref(640);
const frameHeight = ref(480);
const fps = ref(0);

// Frame synchronization
const currentVideoTime = ref(0);
const detectionBuffer = ref([]); // Store all detections with timestamps
const timeSync = ref(0); // Offset adjustment in seconds

const statusText = {
  connected: "Connected - Real-time Video Detection",
  connecting: "Connecting to backend...",
  reconnecting: "Reconnecting...",
  disconnected: "Connection Lost"
};

let renderAnimationId = null;

onMounted(async () => {
  // Initialize services
  setupStreamHealthMonitoring();
  setupWebSocketListening();
  startRenderLoop();

  // Connect WebSocket
  try {
    await websocketService.connect();
  } catch (error) {
    console.error("Failed to connect WebSocket:", error);
  }
});

onUnmounted(() => {
  if (renderAnimationId) {
    cancelAnimationFrame(renderAnimationId);
  }
  streamHealthMonitor.shutdown();
  websocketService.disconnect();
});

const setupStreamHealthMonitoring = () => {
  streamHealthMonitor.on('statusChanged', (data) => {
    streamStatus.value = data.status;
    frameWidth.value = streamHealthMonitor.frameWidth;
    frameHeight.value = streamHealthMonitor.frameHeight;
  });

  streamHealthMonitor.start();
};

const setupWebSocketListening = () => {
  websocketService.on('PPE_DETECTION_BATCH_VIDEO', (data) => {
    console.log('📹 Video detection batch received:', data.count, 'detections');
    handleDetectionBatch(data);
  });

  websocketService.on('VIDEO_ERROR', (data) => {
    console.error('❌ Video error:', data);
    processingError.value = `${data.error}: ${data.message}`;
    streamStatus.value = "disconnected";
    isProcessing.value = false;

    setTimeout(() => {
      processingError.value = "";
    }, 5000);
  });

  websocketService.on('connected', () => {
    console.log("✅ WebSocket connected");
    streamStatus.value = "connected";
  });

  websocketService.on('disconnected', () => {
    console.log("❌ WebSocket disconnected");
    streamStatus.value = "disconnected";
  });

  websocketService.on('error', (error) => {
    console.error("❌ WebSocket error:", error);
    streamStatus.value = "reconnecting";
  });
};

const handleDetectionBatch = (data) => {
  console.log('📊 Handling batch:', { predictions: data.predictions?.length, frame: data.frame, source: data.source });
  
  const detectionData = detectionService.parseDetectionData(data);

  frameWidth.value = detectionData.frameWidth;
  frameHeight.value = detectionData.frameHeight;

  // Calculate timestamp based on frame number
  // Assuming frames are extracted at a certain rate (e.g., 1 per 2 seconds based on FRAME_SAMPLE_RATE=2)
  const frameTimestamp = (data.frame || 0) * 2; // 2 seconds per frame (configurable)
  
  // Store detections with timestamp
  const annotationsWithTime = detectionData.predictions.map(p => ({
    ...detectionService.createAnnotation(p, detectionData.frame, detectionData.source),
    timestamp: frameTimestamp,
    receivedAt: Date.now()
  }));

  // Add to buffer (keep last 50 detections)
  detectionBuffer.value.push(...annotationsWithTime);
  if (detectionBuffer.value.length > 50) {
    detectionBuffer.value = detectionBuffer.value.slice(-50);
  }

  detectionCount.value += annotationsWithTime.length;
  lastDetectionTime.value = Date.now();
  
  console.log('📌 Detection buffer size:', detectionBuffer.value.length, 'Timestamp:', frameTimestamp);
};

const drawFrame = () => {
  const canvas = canvasElement.value;
  const video = imageElement.value;

  if (!canvas || !video) {
    return;
  }

  // For video element, check if it has valid dimensions
  if (video.tagName === 'VIDEO' && (video.videoWidth === 0 || video.videoHeight === 0)) {
    return;
  }

  // Track current playback time
  currentVideoTime.value = video.currentTime || 0;

  // Set canvas size to match video dimensions
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
  }

  fpsCounter.record();
  fps.value = fpsCounter.getFPS();

  // Filter annotations by video playback time
  // Show detections from a 2-second window around current playback time
  const timeWindow = 2; // seconds
  const minTime = currentVideoTime.value - 0.5;
  const maxTime = currentVideoTime.value + timeWindow;

  const currentTimeAnnotations = detectionBuffer.value.filter(a => {
    const annotationTime = a.timestamp || 0;
    return annotationTime >= minTime && annotationTime <= maxTime;
  });

  console.log(`⏱️ Video time: ${currentVideoTime.value.toFixed(1)}s | Showing ${currentTimeAnnotations.length} annotations`);

  const stats = {
    totalDetections: detectionCount.value,
    activeCount: currentTimeAnnotations.length,
    fps: fps.value
  };

  displayedAnnotations.value = currentTimeAnnotations;
  canvasRenderer.render(canvas, currentTimeAnnotations, stats, isProcessing.value);
};

const startRenderLoop = () => {
  const render = () => {
    drawFrame();
    renderAnimationId = requestAnimationFrame(render);
  };

  renderAnimationId = requestAnimationFrame(render);
};

const startProcessing = async () => {
  try {
    processingError.value = "";
    await apiService.startVideoProcessing("street_vehicles_people.mp4");
    isProcessing.value = true;
    console.log("✅ Video Processing started");
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
    console.error("❌ Error starting video processing:", error);
  }
};

const stopProcessing = async () => {
  try {
    processingError.value = "";
    await apiService.stopVideoProcessing();
    isProcessing.value = false;
    displayedAnnotations.value = [];
    detectionBuffer.value = [];
    currentVideoTime.value = 0;

    console.log("✅ Video Processing stopped");
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
    console.error("❌ Error stopping video processing:", error);
  }
};
</script>

<template>
  <div class="stream-container">
    <div class="stream-header">
      <h2><i class="fas fa-film"></i> Video Stream Detection</h2>
      <div class="status-indicator" :class="streamStatus">
        <span class="status-dot"></span>
        <span class="status-text">{{ statusText[streamStatus] }}</span>
      </div>
    </div>

    <div class="processing-controls">
      <div class="control-group">
        <button 
          v-if="!isProcessing"
          @click="startProcessing"
          class="btn btn-primary"
        >
          <i class="fas fa-play"></i> Start Detection
        </button>
        <button 
          v-else
          @click="stopProcessing"
          class="btn btn-danger"
        >
          <i class="fas fa-stop"></i> Stop Detection
        </button>
      </div>
      <div class="control-info">
        <span v-if="isProcessing" class="status-badge processing">
          <i class="fas fa-spinner fa-spin"></i> DETECTING
        </span>
        <span v-else class="status-badge idle">
          <i class="fas fa-pause"></i> IDLE
        </span>
        <span class="detection-count">
          <i class="fas fa-shield-alt"></i> {{ detectionCount }} Total
        </span>
        <span class="fps-badge">
          <i class="fas fa-tachometer-alt"></i> {{ fps.toFixed(1) }} FPS
        </span>
      </div>
      <div v-if="processingError" class="error-message">
        <i class="fas fa-exclamation-circle"></i> {{ processingError }}
      </div>
    </div>

    <div class="main-content">
      <div class="video-section">
        <div class="canvas-wrapper">
          <div class="stream-container-inner">
            <video 
              ref="imageElement"
              :src="apiService.getVideoStreamUrl()"
              alt="Video Stream"
              class="stream-image"
              autoplay
              loop
              muted
              @loadstart="drawFrame"
              @play="drawFrame"
              @timeupdate="drawFrame"
              @error="() => streamStatus = 'disconnected'"
            ></video>
            <canvas 
              ref="canvasElement"
              class="detection-canvas"
            ></canvas>
          </div>
        </div>
      </div>

      <div class="video-info-panel">
        <div class="panel-header">
          <h3><i class="fas fa-info-circle"></i> Video Info</h3>
          <div class="live-badge">
            <span class="live-dot"></span> LIVE
          </div>
        </div>

        <div class="info-content">
          <div class="info-item">
            <div class="info-label">Status</div>
            <div class="info-value">
              <span :class="['status-tag', isProcessing ? 'detecting' : 'idle']">
                {{ isProcessing ? '🟢 DETECTING' : '⊚ IDLE' }}
              </span>
            </div>
          </div>

          <div class="info-item">
            <div class="info-label">Total Detections</div>
            <div class="info-value large">{{ detectionCount }}</div>
          </div>

          <div class="info-item">
            <div class="info-label">Current Annotations</div>
            <div class="info-value large">{{ displayedAnnotations.length }}</div>
          </div>

          <div class="info-item">
            <div class="info-label">Frame Rate</div>
            <div class="info-value">{{ fps.toFixed(1) }} FPS</div>
          </div>

          <div class="info-item">
            <div class="info-label">Resolution</div>
            <div class="info-value">{{ frameWidth }}×{{ frameHeight }}</div>
          </div>

          <div class="info-item">
            <div class="info-label">Current Time</div>
            <div class="info-value">{{ Math.floor(currentVideoTime).toString().padStart(2, '0') }}:{{ (Math.floor((currentVideoTime % 1) * 60)).toString().padStart(2, '0') }}</div>
          </div>

          <div class="info-item">
            <div class="info-label">Buffer Size</div>
            <div class="info-value">{{ detectionBuffer.length }} items</div>
          </div>
        </div>

        <div class="panel-footer">
          <div class="footer-item">
            <span class="footer-label">Source</span>
            <span class="footer-value">Local YOLO</span>
          </div>
          <div class="footer-item">
            <span class="footer-label">Mode</span>
            <span class="footer-value">Video</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stream-container {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.stream-header {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
  padding: 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stream-header h2 {
  font-size: 1.8rem;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
}

.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-indicator.connected .status-dot {
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
}

.status-indicator.connecting .status-dot,
.status-indicator.reconnecting .status-dot {
  background: #f59e0b;
}

.status-indicator.disconnected .status-dot {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

.processing-controls {
  padding: 20px;
  background: #f3f4f6;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
}

.control-group {
  display: flex;
  gap: 10px;
}

.control-info {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.btn-danger:hover {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);
}

.status-badge,
.fps-badge,
.detection-count {
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.status-badge.processing {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.status-badge.idle {
  background: #f3f4f6;
  color: #6b7280;
}

.fps-badge {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
}

.detection-count {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.error-message {
  flex-basis: 100%;
  padding: 12px 16px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  border-left: 4px solid #dc2626;
}

.main-content {
  display: flex;
  gap: 20px;
  padding: 20px;
  background: #f9fafb;
}

.video-section {
  flex: 1;
  min-width: 0;
}

.canvas-wrapper {
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
}

.stream-container-inner {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.stream-image {
  display: block;
  max-width: 100%;
  height: auto;
  background: #000;
}

.detection-canvas {
  position: absolute;
  top: 0;
  left: 0;
  cursor: crosshair;
  pointer-events: none;
}

.video-info-panel {
  width: 380px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  max-height: 700px;
  overflow: hidden;
}

.panel-header {
  padding: 20px;
  border-bottom: 2px solid #e5e7eb;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 10px;
}

.live-badge {
  padding: 8px 14px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  letter-spacing: 0.5px;
}

.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
  animation: blink 1.5s infinite;
}

@keyframes blink {
  0%, 49%, 100% { opacity: 1; }
  50%, 99% { opacity: 0.3; }
}

.info-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.info-item {
  padding: 15px;
  background: #f9fafb;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}

.info-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  font-weight: 600;
}

.info-value {
  font-size: 1rem;
  color: #1f2937;
  font-weight: 600;
}

.info-value.large {
  font-size: 1.8rem;
  color: #8b5cf6;
}

.status-tag {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 700;
}

.status-tag.detecting {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #059669;
}

.status-tag.idle {
  background: #f3f4f6;
  color: #6b7280;
}

.panel-footer {
  padding: 20px;
  border-top: 2px solid #e5e7eb;
  background: #f9fafb;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.footer-item {
  text-align: center;
  padding: 10px;
}

.footer-label {
  display: block;
  font-size: 0.7rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  font-weight: 600;
}

.footer-value {
  display: block;
  font-size: 1rem;
  color: #1f2937;
  font-weight: 700;
}

@media (max-width: 1400px) {
  .main-content {
    flex-direction: column;
  }
  
  .video-info-panel {
    width: 100%;
    max-height: 400px;
  }
}
</style>
