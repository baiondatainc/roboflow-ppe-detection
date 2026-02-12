<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
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

// PPE Status
const ppeStatus = ref({
  hardhat: { present: false, confidence: 0, lastSeen: null },
  helmet: { present: false, confidence: 0, lastSeen: null },
  head: { present: false, confidence: 0, lastSeen: null },
  gloves: { present: false, confidence: 0, lastSeen: null },
  hand: { present: false, confidence: 0, lastSeen: null },
  vest: { present: false, confidence: 0, lastSeen: null },
  safety_vest: { present: false, confidence: 0, lastSeen: null },
  person: { present: false, confidence: 0, lastSeen: null }
});

const statusText = {
  connected: "Connected - Real-time Live Webcam Detection",
  connecting: "Connecting to webcam...",
  reconnecting: "Reconnecting...",
  disconnected: "Connection Lost"
};

let renderAnimationId = null;

// Computed PPE compliance
const ppeCompliance = computed(() => {
  const hasHead = ppeStatus.value.hardhat.present || 
                  ppeStatus.value.helmet.present || 
                  ppeStatus.value.head.present;
  
  const hasHands = ppeStatus.value.gloves.present || 
                   ppeStatus.value.hand.present;
  
  const hasVest = ppeStatus.value.vest.present || 
                  ppeStatus.value.safety_vest.present;
  
  const hasPerson = ppeStatus.value.person.present;
  
  return {
    person: hasPerson,
    hardhat: hasHead,
    gloves: hasHands,
    vest: hasVest,
    compliant: hasPerson && hasHead && hasHands && hasVest
  };
});

onMounted(async () => {
  // Initialize services
  setupStreamHealthMonitoring();
  setupWebSocketListening();
  startRenderLoop();
  startPPEStatusUpdater();

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
  websocketService.on('PPE_DETECTION_BATCH_WEBCAM', (data) => {
    handleDetectionBatch(data);
  });

  websocketService.on('WEBCAM_ERROR', (data) => {
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
  const detectionData = detectionService.parseDetectionData(data);
  
  frameWidth.value = detectionData.frameWidth;
  frameHeight.value = detectionData.frameHeight;

  // Update PPE status from all predictions
  const ppeUpdate = detectionService.extractPPEStatus(detectionData.predictions);
  ppeStatus.value = ppeUpdate;

  // Filter for display
  const filteredPredictions = detectionService.filterForDisplay(detectionData.predictions);

  displayedAnnotations.value = filteredPredictions.map(p =>
    detectionService.createAnnotation(p, detectionData.frame, detectionData.source)
  );

  detectionCount.value += filteredPredictions.length;
  lastDetectionTime.value = Date.now();
};

const startPPEStatusUpdater = () => {
  setInterval(() => {
    const now = Date.now();
    const timeoutMs = 2000;

    Object.keys(ppeStatus.value).forEach(key => {
      const item = ppeStatus.value[key];
      if (item.lastSeen && (now - item.lastSeen) > timeoutMs) {
        item.present = false;
        item.confidence = 0;
      }
    });
  }, 500);
};

const drawFrame = () => {
  const canvas = canvasElement.value;
  const img = imageElement.value;

  if (!canvas || !img || !img.complete || img.naturalWidth === 0) {
    return;
  }

  fpsCounter.record();
  fps.value = fpsCounter.getFPS();

  const latestFrame = Math.max(...displayedAnnotations.value.map(a => a.frame || 0), 0);
  const currentFrameAnnotations = displayedAnnotations.value.filter(a =>
    a.frame === latestFrame
  );

  const stats = {
    totalDetections: detectionCount.value,
    activeCount: currentFrameAnnotations.length,
    fps: fps.value
  };

  canvasRenderer.render(canvas, currentFrameAnnotations, stats, isProcessing.value);
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
    await apiService.startWebcamProcessing();
    isProcessing.value = true;
    console.log("✅ Webcam Processing started");
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
    console.error("❌ Error starting webcam processing:", error);
  }
};

const stopProcessing = async () => {
  try {
    processingError.value = "";
    await apiService.stopWebcamProcessing();
    isProcessing.value = false;
    displayedAnnotations.value = [];

    Object.keys(ppeStatus.value).forEach(key => {
      ppeStatus.value[key] = { present: false, confidence: 0, lastSeen: null };
    });

    console.log("✅ Webcam Processing stopped");
  } catch (error) {
    processingError.value = "Connection error: " + error.message;
    console.error("❌ Error stopping webcam processing:", error);
  }
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
          <div class="stream-container">
            <img 
              ref="imageElement"
              :src="apiService.getWebcamStreamUrl()"
              alt="Live Webcam Stream"
              class="stream-image"
              @load="drawFrame"
              @error="() => streamStatus = 'disconnected'"
            />
            <canvas 
              ref="canvasElement"
              class="detection-canvas"
            ></canvas>
          </div>
        </div>
      </div>

      <div class="ppe-status-panel">
        <div class="panel-header">
          <h3><i class="fas fa-shield-alt"></i> PPE Status</h3>
          <div 
            class="compliance-badge"
            :class="ppeCompliance.compliant ? 'compliant' : 'non-compliant'"
          >
            {{ ppeCompliance.compliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT' }}
          </div>
        </div>

        <div class="ppe-items">
          <div 
            class="ppe-item"
            :class="{ 
              'present': ppeCompliance.person,
              'missing': !ppeCompliance.person && isProcessing
            }"
          >
            <div class="ppe-icon">
              <i class="fas fa-user"></i>
            </div>
            <div class="ppe-info">
              <div class="ppe-name">Person Detected</div>
              <div class="ppe-status">
                <span v-if="ppeCompliance.person" class="status-present">
                  <i class="fas fa-check-circle"></i> Present
                  <span class="confidence">{{ Math.max(
                    ppeStatus.person.confidence * 100
                  ).toFixed(0) }}%</span>
                </span>
                <span v-else class="status-missing">
                  <i class="fas fa-times-circle"></i> Not Detected
                </span>
              </div>
            </div>
          </div>

          <div 
            class="ppe-item"
            :class="{ 
              'present': ppeCompliance.hardhat,
              'missing': !ppeCompliance.hardhat && ppeCompliance.person
            }"
          >
            <div class="ppe-icon">
              <i class="fas fa-hard-hat"></i>
            </div>
            <div class="ppe-info">
              <div class="ppe-name">Hard Hat / Helmet</div>
              <div class="ppe-status">
                <span v-if="ppeCompliance.hardhat" class="status-present">
                  <i class="fas fa-check-circle"></i> Present
                  <span class="confidence">{{ Math.max(
                    ppeStatus.hardhat.confidence * 100,
                    ppeStatus.helmet.confidence * 100,
                    ppeStatus.head.confidence * 100
                  ).toFixed(0) }}%</span>
                </span>
                <span v-else class="status-missing">
                  <i class="fas fa-exclamation-triangle"></i> MISSING
                </span>
              </div>
            </div>
          </div>

          <div 
            class="ppe-item"
            :class="{ 
              'present': ppeCompliance.gloves,
              'missing': !ppeCompliance.gloves && ppeCompliance.person
            }"
          >
            <div class="ppe-icon">
              <i class="fas fa-mitten"></i>
            </div>
            <div class="ppe-info">
              <div class="ppe-name">Safety Gloves</div>
              <div class="ppe-status">
                <span v-if="ppeCompliance.gloves" class="status-present">
                  <i class="fas fa-check-circle"></i> Present
                  <span class="confidence">{{ Math.max(
                    ppeStatus.gloves.confidence * 100,
                    ppeStatus.hand.confidence * 100
                  ).toFixed(0) }}%</span>
                </span>
                <span v-else class="status-missing">
                  <i class="fas fa-exclamation-triangle"></i> MISSING
                </span>
              </div>
            </div>
          </div>

          <div 
            class="ppe-item"
            :class="{ 
              'present': ppeCompliance.vest,
              'missing': !ppeCompliance.vest && ppeCompliance.person
            }"
          >
            <div class="ppe-icon">
              <i class="fas fa-vest"></i>
            </div>
            <div class="ppe-info">
              <div class="ppe-name">Safety Vest</div>
              <div class="ppe-status">
                <span v-if="ppeCompliance.vest" class="status-present">
                  <i class="fas fa-check-circle"></i> Present
                  <span class="confidence">{{ Math.max(
                    ppeStatus.vest.confidence * 100,
                    ppeStatus.safety_vest.confidence * 100
                  ).toFixed(0) }}%</span>
                </span>
                <span v-else class="status-missing">
                  <i class="fas fa-exclamation-triangle"></i> MISSING
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="status-summary">
          <div class="summary-item">
            <div class="summary-label">Total Detections</div>
            <div class="summary-value">{{ detectionCount }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Frame Rate</div>
            <div class="summary-value">{{ fps.toFixed(1) }} FPS</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Resolution</div>
            <div class="summary-value">{{ frameWidth }}×{{ frameHeight }}</div>
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

.stream-container {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.stream-image {
  display: block;
  max-width: 100%;
  height: auto;
}

.detection-canvas {
  position: absolute;
  top: 0;
  left: 0;
  cursor: crosshair;
  pointer-events: none;
}

.ppe-status-panel {
  width: 380px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  max-height: 700px;
}

.panel-header {
  padding: 20px;
  border-bottom: 2px solid #e5e7eb;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
}

.panel-header h3 {
  margin: 0 0 12px 0;
  font-size: 1.2rem;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 10px;
}

.compliance-badge {
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
  letter-spacing: 0.5px;
}

.compliance-badge.compliant {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.compliance-badge.non-compliant {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.ppe-items {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
}

.ppe-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 18px;
  margin-bottom: 12px;
  border-radius: 10px;
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  transition: all 0.3s;
}

.ppe-item.present {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  border-color: #10b981;
}

.ppe-item.missing {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  border-color: #ef4444;
  animation: shake 0.5s;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.ppe-icon {
  font-size: 2rem;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 50%;
  color: #6b7280;
}

.ppe-item.present .ppe-icon {
  color: #10b981;
  background: #d1fae5;
}

.ppe-item.missing .ppe-icon {
  color: #ef4444;
  background: #fee2e2;
}

.ppe-info {
  flex: 1;
}

.ppe-name {
  font-weight: 600;
  font-size: 1rem;
  color: #1f2937;
  margin-bottom: 6px;
}

.ppe-status {
  font-size: 0.9rem;
}

.status-present {
  color: #059669;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-missing {
  color: #dc2626;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.confidence {
  background: #059669;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  margin-left: 6px;
}

.status-summary {
  padding: 20px;
  border-top: 2px solid #e5e7eb;
  background: #f9fafb;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
}

.summary-item {
  text-align: center;
}

.summary-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.summary-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #1f2937;
}

@media (max-width: 1400px) {
  .main-content {
    flex-direction: column;
  }
  
  .ppe-status-panel {
    width: 100%;
  }
}
</style>
