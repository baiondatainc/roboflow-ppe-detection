<script setup>
import { ref, onMounted } from "vue";
import socket from "../services/socket";

const imageElement = ref(null);
const canvasElement = ref(null);
const streamStatus = ref("connecting");
const displayedAnnotations = ref([]);
const isProcessing = ref(false);
const processingError = ref("");
const detectionCount = ref(0);
const lastDetectionTime = ref(null);
const sourceType = ref(""); // camera or video

// Canvas dimensions - will match image size
const canvasWidth = ref(640);
const canvasHeight = ref(480);

const statusText = {
  connected: "Connected - Real-time Helmet & Glove Detection",
  connecting: "Connecting to backend...",
  reconnecting: "Reconnecting...",
  disconnected: "Connection Lost"
};

onMounted(() => {
  checkStreamHealth();
  setInterval(checkStreamHealth, 5000);
  
  // Setup WebSocket for annotations
  setupAnnotationListener();
  
  // Check processing status
  checkProcessingStatus();
  setInterval(checkProcessingStatus, 2000);
  
  // Start rendering detections
  startRenderLoop();
});

const checkStreamHealth = async () => {
  try {
    const response = await fetch("http://localhost:3001/health");
    if (response.ok) {
      const data = await response.json();
      if (data.status === "ok") {
        streamStatus.value = "connected";
      } else {
        handleStreamError();
      }
    } else {
      handleStreamError();
    }
  } catch (error) {
    handleStreamError();
  }
};

const handleStreamError = () => {
  streamStatus.value = "reconnecting";
  setTimeout(checkStreamHealth, 2000);
};

const drawAnnotations = () => {
  if (!canvasElement.value || !imageElement.value) return;
  
  const canvas = canvasElement.value;
  const img = imageElement.value;
  const ctx = canvas.getContext("2d");
  
  // Set canvas size to match image
  canvas.width = img.width;
  canvas.height = img.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw each annotation
  displayedAnnotations.value.forEach((annotation) => {
    if (!annotation.boundingBox) return;
    
    const box = annotation.boundingBox;
    const x = (box.x / 100) * canvas.width;
    const y = (box.y / 100) * canvas.height;
    const width = (box.width / 100) * canvas.width;
    const height = (box.height / 100) * canvas.height;
    
    // Color based on confidence
    const color = annotation.confidence > 0.8 ? "#ef4444" : "#f59e0b";
    
    // Draw bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    
    // Draw label background
    const label = `${annotation.type}`;
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.font = "bold 14px Arial";
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(x, y - 28, textWidth + 10, 24);
    
    // Draw label text
    ctx.fillStyle = color;
    ctx.fillText(label, x + 5, y - 9);
    
    // Draw confidence percentage
    const confidenceText = `${(annotation.confidence * 100).toFixed(1)}%`;
    ctx.fillStyle = color;
    ctx.font = "bold 12px Arial";
    ctx.fillText(confidenceText, x + 5, y + height + 18);
  });
  
  // Draw stats panel
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, 300, 80);
  
  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px Arial";
  ctx.fillText(`Detections: ${detectionCount.value}`, 15, 25);
  
  ctx.font = "14px Arial";
  ctx.fillText(`Active: ${displayedAnnotations.value.length}`, 15, 50);
  
  if (lastDetectionTime.value) {
    const timeDiff = Math.floor((Date.now() - lastDetectionTime.value) / 1000);
    ctx.fillText(`Last: ${timeDiff}s ago`, 15, 70);
  }
  
  // Draw processing status
  if (isProcessing.value) {
    ctx.fillStyle = "#10b981";
    ctx.fillRect(canvas.width - 180, 10, 170, 30);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px Arial";
    ctx.fillText("🔴 PROCESSING LIVE", canvas.width - 170, 30);
  }
};

const startRenderLoop = () => {
  const render = () => {
    drawAnnotations();
    requestAnimationFrame(render);
  };
  render();
};

// Processing control functions
const startProcessing = async () => {
  try {
    processingError.value = "";
    const response = await fetch("http://localhost:3001/api/start-processing", {
      method: "POST"
    });

    if (response.ok) {
      const data = await response.json();
      sourceType.value = data.source || "unknown";
      isProcessing.value = true;
      console.log("✅ Processing started:", data);
    } else {
      const error = await response.json();
      processingError.value = error.error || "Failed to start processing";
      console.error("❌ Start processing failed:", error);
    }
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
    console.error("❌ Error starting processing:", error);
  }
};

const stopProcessing = async () => {
  try {
    processingError.value = "";
    const response = await fetch("http://localhost:3001/api/stop-processing", {
      method: "POST"
    });

    if (response.ok) {
      isProcessing.value = false;
      console.log("✅ Processing stopped");
    } else {
      const error = await response.json();
      processingError.value = error.error || "Failed to stop processing";
      console.error("❌ Stop processing failed:", error);
    }
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
    console.error("❌ Error stopping processing:", error);
  }
};

const checkProcessingStatus = async () => {
  try {
    const response = await fetch("http://localhost:3001/api/status");
    if (response.ok) {
      const data = await response.json();
      isProcessing.value = data.isProcessing;
    }
  } catch (error) {
    console.error("❌ Error checking status:", error);
  }
};

// Update WebSocket message handler
const setupAnnotationListener = () => {
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("📨 Detection received:", data);
      
      // Handle PPE_DETECTION events from Roboflow
      if (data.eventType === "PPE_DETECTION") {
        const annotation = {
          type: data.type || "PPE_Missing",
          frame: data.frame,
          confidence: data.confidence || 0,
          timestamp: data.timestamp || new Date().toISOString(),
          boundingBox: data.boundingBox || {
            x: 0,
            y: 0,
            width: 20,
            height: 30
          }
        };
        
        lastDetectionTime.value = Date.now();
        displayedAnnotations.value.unshift(annotation);
        detectionCount.value++;
        
        // Keep last 20 detections
        if (displayedAnnotations.value.length > 20) {
          displayedAnnotations.value.pop();
        }
        
        console.log("✅ Detection rendered. Total:", displayedAnnotations.value.length);
      }
    } catch (error) {
      console.error("❌ Error processing detection:", error);
    }
  };
  
  socket.addEventListener("open", () => {
    console.log("✅ WebSocket connected");
  });
  
  socket.addEventListener("close", () => {
    console.log("❌ WebSocket disconnected");
  });
  
  socket.addEventListener("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
  
  socket.addEventListener("message", handleMessage);
};
</script>

<template>
  <div class="stream-container">
    <div class="stream-header">
      <h2><i class="fas fa-shield-alt"></i> Roboflow PPE Detection</h2>
      <div class="status-indicator" :class="streamStatus">
        <span class="status-dot"></span>
        <span class="status-text">{{ statusText[streamStatus] }}</span>
      </div>
    </div>

    <!-- Processing Controls -->
    <div class="processing-controls">
      <div class="control-group">
        <button 
          v-if="!isProcessing"
          @click="startProcessing"
          class="btn btn-primary"
        >
          <i class="fas fa-play"></i> Start Processing
        </button>
        <button 
          v-else
          @click="stopProcessing"
          class="btn btn-danger"
        >
          <i class="fas fa-stop"></i> Stop Processing
        </button>
      </div>
      <div class="control-info">
        <span v-if="isProcessing" class="status-badge processing">
          <i class="fas fa-spinner fa-spin"></i> LIVE
        </span>
        <span v-else class="status-badge idle">
          <i class="fas fa-pause"></i> IDLE
        </span>
        <span class="detection-count">
          <i class="fas fa-shield-alt"></i> {{ detectionCount }} Detections
        </span>
        <span v-if="sourceType" class="source-badge" :class="sourceType">
          <i :class="sourceType === 'camera' ? 'fas fa-video' : 'fas fa-film'"></i>
          {{ sourceType === 'camera' ? '📷 LIVE CAMERA' : '🎬 VIDEO FILE' }}
        </span>
      </div>
      <div v-if="processingError" class="error-message">
        <i class="fas fa-exclamation-circle"></i> {{ processingError }}
      </div>
    </div>

    <!-- Stream Display -->
    <div class="canvas-wrapper">
      <div class="stream-container">
        <!-- MJPEG Stream from backend -->
        <img 
          ref="imageElement"
          src="http://localhost:3001/stream"
          alt="Live Camera Stream"
          class="stream-image"
          @load="drawAnnotations"
        />
        <!-- Canvas overlay for detections -->
        <canvas 
          ref="canvasElement"
          class="detection-canvas"
        ></canvas>
      </div>
    </div>

    <!-- Live Detections List -->
    <div class="detections-panel">
      <div class="detections-header">
        <h3><i class="fas fa-list"></i> Live Detections</h3>
        <span class="detection-badge">{{ displayedAnnotations.length }}</span>
      </div>
      <div class="detections-list">
        <div v-if="displayedAnnotations.length === 0" class="empty-state">
          <p><i class="fas fa-inbox"></i> Waiting for detections...</p>
        </div>
        <div 
          v-for="(annotation, index) in displayedAnnotations" 
          :key="index"
          class="detection-item"
          :class="{ 'high-confidence': annotation.confidence > 0.8 }"
        >
          <div class="detection-main">
            <span class="detection-type">{{ annotation.type }}</span>
            <span class="detection-confidence">{{ (annotation.confidence * 100).toFixed(1) }}%</span>
          </div>
          <div class="detection-meta">
            <small>Frame #{{ annotation.frame }} • {{ new Date(annotation.timestamp).toLocaleTimeString() }}</small>
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-indicator.connected .status-dot {
  background: #10b981;
}

.status-indicator.connecting .status-dot,
.status-indicator.reconnecting .status-dot {
  background: #f59e0b;
}

.status-indicator.disconnected .status-dot {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.processing-controls {
  padding: 20px;
  background: #f3f4f6;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.control-group {
  display: flex;
  gap: 10px;
}

.control-info {
  display: flex;
  gap: 15px;
  align-items: center;
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
  transition: all 0.3s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
  transform: translateY(-2px);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
  transform: translateY(-2px);
}

.status-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-badge.processing {
  background: #dcfce7;
  color: #166534;
}

.status-badge.idle {
  background: #f3f4f6;
  color: #6b7280;
}

.source-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.source-badge.camera {
  background: #fca5a5;
  color: #7f1d1d;
}

.source-badge.video {
  background: #a5f3fc;
  color: #0c4a6e;
}

.detection-count {
  padding: 6px 12px;
  background: #f0fdf4;
  color: #15803d;
  border-radius: 6px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.error-message {
  padding: 10px 15px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.canvas-wrapper {
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
  max-height: 700px;
  min-height: 400px;
}

.stream-container {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.stream-image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.detection-canvas {
  position: absolute;
  top: 0;
  left: 0;
  cursor: crosshair;
  border-radius: 4px;
}

.detections-panel {
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
}

.detections-header {
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  background: white;
}

.detections-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detection-badge {
  background: #3b82f6;
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

.detections-list {
  max-height: 300px;
  overflow-y: auto;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #9ca3af;
  font-size: 0.95rem;
}

.empty-state i {
  font-size: 2rem;
  display: block;
  margin-bottom: 10px;
  opacity: 0.5;
}

.detection-item {
  padding: 12px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.detection-item:hover {
  background: #f3f4f6;
}

.detection-item.high-confidence {
  border-left: 4px solid #ef4444;
}

.detection-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.detection-type {
  font-weight: 600;
  color: #1f2937;
}

.detection-confidence {
  background: #fee2e2;
  color: #991b1b;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
}

.detection-item.high-confidence .detection-confidence {
  background: #dcfce7;
  color: #166534;
}

.detection-meta {
  color: #6b7280;
  font-size: 0.85rem;
}
</style>
