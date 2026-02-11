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

// Canvas dimensions - will match image size
const canvasWidth = ref(640);
const canvasHeight = ref(480);

const statusText = {
  connected: "Connected - Real-time Live Webcam Detection",
  connecting: "Connecting to webcam...",
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
  
  // Wait for image to be loaded
  if (!img.complete || img.width === 0 || img.height === 0) {
    return;
  }
  
  // Set canvas size to match actual displayed image dimensions
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Color mapping for different PPE types
  const colorMap = {
    head: "#FF6B6B",           // Red
    hand: "#4ECDC4",           // Teal
    vest: "#FFE66D",           // Yellow
    helmet: "#95E1D3",         // Mint
    gloves: "#A8E6CF",         // Light Green
    safety_vest: "#FFD3B6",    // Peach
    person: "#FFAAA5"          // Light Red
  };
  
  // Helper function to get color based on type
  const getTypeColor = (type) => {
    const lowerType = type.toLowerCase();
    for (const [key, color] of Object.entries(colorMap)) {
      if (lowerType.includes(key)) return color;
    }
    return "#f59e0b"; // Default
  };
  
  // Draw each annotation with defensive checks
  displayedAnnotations.value.forEach((annotation) => {
    if (!annotation || !annotation.boundingBox) return;
    
    const box = annotation.boundingBox;
    if (!box || typeof box.x !== 'number' || typeof box.y !== 'number') return;
    
    // Calculate coordinates from Roboflow center-based format
    const x = Math.max(0, box.x - box.width / 2);
    const y = Math.max(0, box.y - box.height / 2);
    const width = Math.min(box.width, canvas.width - x);
    const height = Math.min(box.height, canvas.height - y);
    
    // Skip if box is outside canvas
    if (x >= canvas.width || y >= canvas.height || width <= 0 || height <= 0) {
      return;
    }
    
    // Get color based on type (with fallback to confidence)
    const color = getTypeColor(annotation.type);
    
    // Draw bounding box with thicker line
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    
    // Draw corner markers for better visibility
    const cornerSize = 8;
    ctx.fillStyle = color;
    // Top-left
    ctx.fillRect(x, y, cornerSize, cornerSize);
    ctx.fillRect(x, y, cornerSize * 2, 2);
    ctx.fillRect(x, y, 2, cornerSize * 2);
    // Top-right
    ctx.fillRect(x + width - cornerSize, y, cornerSize, cornerSize);
    ctx.fillRect(x + width - cornerSize * 2, y, cornerSize * 2, 2);
    ctx.fillRect(x + width - 2, y, 2, cornerSize * 2);
    // Bottom-left
    ctx.fillRect(x, y + height - cornerSize, cornerSize, cornerSize);
    ctx.fillRect(x, y + height - 2, cornerSize * 2, 2);
    ctx.fillRect(x, y + height - cornerSize * 2, 2, cornerSize * 2);
    // Bottom-right
    ctx.fillRect(x + width - cornerSize, y + height - cornerSize, cornerSize, cornerSize);
    ctx.fillRect(x + width - cornerSize * 2, y + height - 2, cornerSize * 2, 2);
    ctx.fillRect(x + width - 2, y + height - cornerSize * 2, 2, cornerSize * 2);
    
    // Draw label background with type-specific styling
    const label = `${annotation.type}`;
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
    ctx.font = "bold 14px Arial";
    const textWidth = ctx.measureText(label).width;
    const labelHeight = 28;
    ctx.fillRect(x, y - labelHeight, textWidth + 10, labelHeight);
    
    // Draw colored border for label
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y - labelHeight, textWidth + 10, labelHeight);
    
    // Draw label text
    ctx.fillStyle = color;
    ctx.fillText(label, x + 5, y - 9);
    
    // Draw confidence percentage with background
    const confidenceText = `${(annotation.confidence * 100).toFixed(1)}%`;
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
    ctx.font = "bold 12px Arial";
    const confWidth = ctx.measureText(confidenceText).width;
    ctx.fillRect(x, y + height + 5, confWidth + 6, 18);
    
    // Draw confidence value
    ctx.fillStyle = color;
    ctx.fillText(confidenceText, x + 3, y + height + 18);
  });
  
  // Draw stats panel with proper dimensions
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, 320, 100);
  
  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px Arial";
  ctx.fillText(`Detections: ${detectionCount.value}`, 15, 28);
  
  ctx.font = "14px Arial";
  ctx.fillText(`Active: ${displayedAnnotations.value.length}`, 15, 50);
  ctx.fillText(`Frames shown: ${new Set(displayedAnnotations.value.map(a => a.frame)).size}`, 15, 70);
  
  if (lastDetectionTime.value) {
    const timeDiff = Math.floor((Date.now() - lastDetectionTime.value) / 1000);
    ctx.fillText(`Last: ${timeDiff}s ago`, 15, 90);
  }
  
  // Draw processing status
  if (isProcessing.value) {
    ctx.fillStyle = "#10b981";
    ctx.fillRect(canvas.width - 200, 15, 185, 35);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px Arial";
    ctx.fillText("🔴 LIVE WEBCAM", canvas.width - 185, 40);
  }
};

const startRenderLoop = () => {
  let lastImageTime = 0;
  
  const render = () => {
    const canvas = canvasElement.value;
    const img = imageElement.value;
    
    // Redraw only when image loads or on each frame
    if (canvas && img) {
      // Check if image has loaded (width/height set)
      if (img.width > 0 && img.height > 0) {
        drawAnnotations();
      }
    }
    
    requestAnimationFrame(render);
  };
  render();
};

// Processing control functions
const startProcessing = async () => {
  try {
    processingError.value = "";
    const response = await fetch("http://localhost:3001/api/start-webcam-processing", {
      method: "POST"
    });

    if (response.ok) {
      const data = await response.json();
      isProcessing.value = true;
      console.log("✅ Webcam Processing started:", data);
    } else {
      const error = await response.json();
      processingError.value = error.error || "Failed to start webcam processing";
      console.error("❌ Start webcam processing failed:", error);
    }
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
    console.error("❌ Error starting webcam processing:", error);
  }
};

const stopProcessing = async () => {
  try {
    processingError.value = "";
    const response = await fetch("http://localhost:3001/api/stop-webcam-processing", {
      method: "POST"
    });

    if (response.ok) {
      isProcessing.value = false;
      console.log("✅ Webcam Processing stopped");
    } else {
      const error = await response.json();
      processingError.value = error.error || "Failed to stop webcam processing";
      console.error("❌ Stop webcam processing failed:", error);
    }
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
    console.error("❌ Error stopping webcam processing:", error);
  }
};

const checkProcessingStatus = async () => {
  try {
    const response = await fetch("http://localhost:3001/api/status");
    if (response.ok) {
      const data = await response.json();
      // Note: This endpoint returns overall status, not webcam-specific
      // We rely on the isProcessing state from start/stop endpoints
    }
  } catch (error) {
    console.error("❌ Error checking status:", error);
  }
};

// Update WebSocket message handler for webcam detections
const setupAnnotationListener = () => {
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("📨 Detection received:", data);
      
      // Handle WEBCAM_ERROR events
      if (data.eventType === "WEBCAM_ERROR") {
        console.error("❌ Webcam Error:", data.error);
        processingError.value = `${data.error}: ${data.message}`;
        streamStatus.value = "disconnected";
        isProcessing.value = false;
        
        // Show error for 5 seconds
        setTimeout(() => {
          processingError.value = "";
        }, 5000);
        return;
      }
      
      // Handle PPE_DETECTION_WEBCAM events from Roboflow
      if (data.eventType === "PPE_DETECTION_WEBCAM") {
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
        
        // Group detections by frame - clear old detections from different frames
        const currentFrameDetections = displayedAnnotations.value.filter(
          a => a.frame === annotation.frame
        );
        
        // Add new detection
        displayedAnnotations.value.unshift(annotation);
        detectionCount.value++;
        
        // Keep detections from last 3 frames max
        const uniqueFrames = new Set(displayedAnnotations.value.map(a => a.frame));
        if (uniqueFrames.size > 3) {
          displayedAnnotations.value = displayedAnnotations.value.filter(
            a => a.frame >= Math.max(...Array.from(uniqueFrames)) - 2
          );
        }
        
        // Also keep max 20 total detections
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
  <div class="webcam-container">
    <div class="stream-header">
      <h2><i class="fas fa-video"></i> Live Webcam PPE Detection</h2>
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
          <i class="fas fa-play"></i> Start Webcam
        </button>
        <button 
          v-else
          @click="stopProcessing"
          class="btn btn-danger"
        >
          <i class="fas fa-stop"></i> Stop Webcam
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
        <span class="source-badge camera">
          <i class="fas fa-video"></i>
          📷 LIVE CAMERA
        </span>
      </div>
      <div v-if="processingError" class="error-message">
        <i class="fas fa-exclamation-circle"></i> {{ processingError }}
      </div>
    </div>

    <!-- Stream Display -->
    <div class="canvas-wrapper">
      <div class="stream-container">
        <!-- MJPEG Stream from backend webcam endpoint -->
        <img 
          ref="imageElement"
          src="http://localhost:3001/webcam"
          alt="Live Webcam Stream"
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
.webcam-container {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.stream-header {
  background: linear-gradient(135deg, #ec4899 0%, #f97316 100%);
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
