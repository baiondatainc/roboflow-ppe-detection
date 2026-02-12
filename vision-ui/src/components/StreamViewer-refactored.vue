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

const canvasWidth = ref(640);
const canvasHeight = ref(480);
const fps = ref(0);

const statusText = {
  connected: "Connected - Real-time Video Detection",
  connecting: "Connecting to backend...",
  reconnecting: "Reconnecting...",
  disconnected: "Connection Lost"
};

let renderAnimationId = null;

onMounted(async () => {
  setupStreamHealthMonitoring();
  setupWebSocketListening();
  startRenderLoop();

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
  });
  streamHealthMonitor.start();
};

const setupWebSocketListening = () => {
  websocketService.on('PPE_DETECTION_BATCH_VIDEO', (data) => {
    handleDetectionBatch(data);
  });

  websocketService.on('VIDEO_ERROR', (data) => {
    processingError.value = `${data.error}: ${data.message}`;
    isProcessing.value = false;
    setTimeout(() => { processingError.value = ""; }, 5000);
  });

  websocketService.on('connected', () => {
    streamStatus.value = "connected";
  });

  websocketService.on('disconnected', () => {
    streamStatus.value = "disconnected";
  });
};

const handleDetectionBatch = (data) => {
  const detectionData = detectionService.parseDetectionData(data);

  canvasWidth.value = detectionData.frameWidth;
  canvasHeight.value = detectionData.frameHeight;

  const filteredPredictions = detectionService.filterForDisplay(detectionData.predictions);

  displayedAnnotations.value = filteredPredictions.map(p =>
    detectionService.createAnnotation(p, detectionData.frame, detectionData.source)
  );

  detectionCount.value += filteredPredictions.length;
};

const drawFrame = () => {
  const canvas = canvasElement.value;
  const img = imageElement.value;

  if (!canvas || !img || !img.complete || img.naturalWidth === 0) {
    return;
  }

  fpsCounter.record();
  fps.value = fpsCounter.getFPS();

  const stats = {
    totalDetections: detectionCount.value,
    activeCount: displayedAnnotations.value.length,
    fps: fps.value
  };

  canvasRenderer.render(canvas, displayedAnnotations.value, stats, isProcessing.value);
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
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
  }
};

const stopProcessing = async () => {
  try {
    processingError.value = "";
    await apiService.stopVideoProcessing();
    isProcessing.value = false;
    displayedAnnotations.value = [];
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
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

    <div class="controls">
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
      <div v-if="processingError" class="error-message">
        {{ processingError }}
      </div>
    </div>

    <div class="canvas-wrapper">
      <div class="video-container">
        <img 
          ref="imageElement"
          :src="apiService.getVideoStreamUrl()"
          alt="Video Stream"
          class="video-image"
          @load="drawFrame"
        />
        <canvas 
          ref="canvasElement"
          class="detection-canvas"
        ></canvas>
      </div>
    </div>

    <div class="stats">
      <div class="stat-item">
        <span class="stat-label">Total Detections:</span>
        <span class="stat-value">{{ detectionCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">FPS:</span>
        <span class="stat-value">{{ fps.toFixed(1) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stream-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.stream-header {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stream-header h2 {
  margin: 0;
  font-size: 1.6rem;
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  font-size: 0.9rem;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-indicator.connected .status-dot {
  background: #10b981;
}

.status-indicator.disconnected .status-dot {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.controls {
  padding: 20px;
  background: #f3f4f6;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  gap: 15px;
  align-items: center;
}

.control-group {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.error-message {
  padding: 10px 15px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 6px;
  font-weight: 500;
}

.canvas-wrapper {
  background: #000;
  padding: 20px;
  display: flex;
  justify-content: center;
}

.video-container {
  position: relative;
}

.video-image {
  display: block;
  max-width: 100%;
  height: auto;
}

.detection-canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.stats {
  padding: 20px;
  background: #f9fafb;
  display: flex;
  gap: 30px;
  border-top: 1px solid #e5e7eb;
}

.stat-item {
  display: flex;
  gap: 10px;
  align-items: center;
}

.stat-label {
  color: #6b7280;
  font-weight: 600;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
}
</style>
