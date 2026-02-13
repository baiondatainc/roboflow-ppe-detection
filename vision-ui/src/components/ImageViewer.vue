<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  WebSocketService,
  DetectionService,
  CanvasRenderer,
  APIService
} from "../services/index.js";

// Service instances
const apiService = new APIService();
const detectionService = new DetectionService();
const canvasRenderer = new CanvasRenderer();
const websocketService = new WebSocketService();

// Component state
const imageElement = ref(null);
const canvasElement = ref(null);
const fileInput = ref(null);
const connectionStatus = ref("connecting");
const displayedAnnotations = ref([]);
const isProcessing = ref(false);
const processingError = ref("");
const detectionCount = ref(0);
const lastDetectionTime = ref(null);
const uploadedImageUrl = ref("");

// Frame dimensions
const frameWidth = ref(640);
const frameHeight = ref(480);

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
  connected: "Connected - Image PPE Detection Ready",
  connecting: "Connecting...",
  reconnecting: "Reconnecting...",
  disconnected: "Connection Lost"
};

// Render loop
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
  setupWebSocketListening();

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
  websocketService.disconnect();
});

const setupWebSocketListening = () => {
  websocketService.on('PPE_DETECTION_IMAGE', (data) => {
    handleDetectionBatch(data);
  });

  websocketService.on('IMAGE_ERROR', (data) => {
    processingError.value = `${data.error}: ${data.message}`;
    connectionStatus.value = "disconnected";
    isProcessing.value = false;

    setTimeout(() => {
      processingError.value = "";
    }, 5000);
  });

  websocketService.on('connected', () => {
    console.log("✅ WebSocket connected");
    connectionStatus.value = "connected";
  });

  websocketService.on('disconnected', () => {
    console.log("❌ WebSocket disconnected");
    connectionStatus.value = "disconnected";
  });

  websocketService.on('error', (error) => {
    console.error("❌ WebSocket error:", error);
    connectionStatus.value = "reconnecting";
  });
};

const handleDetectionBatch = (data) => {
  console.log('📊 Image detection batch received:', data.predictions?.length, 'detections');
  
  const detectionData = detectionService.parseDetectionData(data);
  
  frameWidth.value = detectionData.frameWidth;
  frameHeight.value = detectionData.frameHeight;

  // Update PPE status from all predictions
  const ppeUpdate = detectionService.extractPPEStatus(detectionData.predictions);
  ppeStatus.value = ppeUpdate;

  // Filter for display
  const filteredPredictions = detectionService.filterForDisplay(detectionData.predictions);

  displayedAnnotations.value = filteredPredictions.map(p =>
    detectionService.createAnnotation(p, 0, 'image')
  );

  detectionCount.value += filteredPredictions.length;
  lastDetectionTime.value = Date.now();
  isProcessing.value = false;

  console.log('✅ Image processed with', filteredPredictions.length, 'displayed annotations');
};

const handleFileSelect = (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) {
    return;
  }

  const file = files[0];

  // Validate file type
  if (!file.type.startsWith('image/')) {
    processingError.value = "Please select a valid image file (JPG, PNG, etc.)";
    setTimeout(() => {
      processingError.value = "";
    }, 3000);
    return;
  }

  // Read and display the image
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImageUrl.value = e.target.result;
    
    // Reset detection state
    displayedAnnotations.value = [];
    detectionCount.value = 0;
    Object.keys(ppeStatus.value).forEach(key => {
      ppeStatus.value[key] = { present: false, confidence: 0, lastSeen: null };
    });

    // Start render loop to continuously draw frame
    startRenderLoop();

    // After image loads, trigger detection
    setTimeout(() => {
      processImage(file);
    }, 100);
  };

  reader.onerror = () => {
    processingError.value = "Error reading file";
    setTimeout(() => {
      processingError.value = "";
    }, 3000);
  };

  reader.readAsDataURL(file);
};

const processImage = async (file) => {
  try {
    processingError.value = "";
    isProcessing.value = true;

    // Send image to backend for detection
    const response = await fetch(`${apiService.baseURL}/api/detect-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: file
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    handleDetectionBatch(data);
  } catch (error) {
    processingError.value = "Detection error: " + error.message;
    isProcessing.value = false;
    console.error("❌ Error processing image:", error);
  }
};

const triggerFileInput = () => {
  fileInput.value?.click();
};

const startRenderLoop = () => {
  if (renderAnimationId) {
    cancelAnimationFrame(renderAnimationId);
  }

  const render = () => {
    drawFrame();
    renderAnimationId = requestAnimationFrame(render);
  };

  renderAnimationId = requestAnimationFrame(render);
};

const stopRenderLoop = () => {
  if (renderAnimationId) {
    cancelAnimationFrame(renderAnimationId);
    renderAnimationId = null;
  }
};

const drawFrame = () => {
  const canvas = canvasElement.value;
  const img = imageElement.value;

  if (!canvas || !img || !img.complete || img.naturalWidth === 0) {
    return;
  }

  // Enhance displayed annotations with PPE status
  const annotationsWithPPE = displayedAnnotations.value.map(ann => ({
    ...ann,
    ppeStatus: ppeStatus.value
  }));

  const stats = {
    totalDetections: detectionCount.value,
    activeCount: annotationsWithPPE.length,
    fps: 0,
    ppeCompliance: ppeCompliance.value
  };

  canvasRenderer.render(canvas, annotationsWithPPE, stats, false);
};

const clearImage = () => {
  stopRenderLoop();
  uploadedImageUrl.value = "";
  displayedAnnotations.value = [];
  detectionCount.value = 0;
  if (fileInput.value) {
    fileInput.value.value = "";
  }
  Object.keys(ppeStatus.value).forEach(key => {
    ppeStatus.value[key] = { present: false, confidence: 0, lastSeen: null };
  });
};
</script>

<template>
  <div class="image-viewer-container">
    <div class="stream-header">
      <h2><i class="fas fa-image"></i> Image PPE Detection</h2>
      <div class="status-indicator" :class="connectionStatus">
        <span class="status-dot"></span>
        <span class="status-text">{{ statusText[connectionStatus] }}</span>
      </div>
    </div>

    <div class="processing-controls">
      <div class="control-group">
        <button 
          @click="triggerFileInput"
          class="btn btn-primary"
          :disabled="isProcessing"
        >
          <i class="fas fa-upload"></i> Upload Image
        </button>
        <button 
          v-if="uploadedImageUrl"
          @click="clearImage"
          class="btn btn-secondary"
          :disabled="isProcessing"
        >
          <i class="fas fa-trash"></i> Clear
        </button>
      </div>
      <div class="control-info">
        <span v-if="isProcessing" class="status-badge processing">
          <i class="fas fa-spinner fa-spin"></i> DETECTING
        </span>
        <span v-else class="status-badge idle">
          <i class="fas fa-pause"></i> READY
        </span>
        <span class="detection-count">
          <i class="fas fa-shield-alt"></i> {{ detectionCount }} Detected
        </span>
        <span class="resolution-badge">
          <i class="fas fa-expand"></i> {{ frameWidth }}×{{ frameHeight }}
        </span>
      </div>
      <div v-if="processingError" class="error-message">
        <i class="fas fa-exclamation-circle"></i> {{ processingError }}
      </div>
    </div>

    <div class="main-content">
      <div class="image-section">
        <div class="canvas-wrapper">
          <div class="image-container">
            <div v-if="!uploadedImageUrl" class="empty-state">
              <div class="empty-icon">
                <i class="fas fa-image"></i>
              </div>
              <div class="empty-text">
                <h3>No Image Selected</h3>
                <p>Upload an image to detect PPE compliance</p>
                <button @click="triggerFileInput" class="btn btn-primary">
                  <i class="fas fa-upload"></i> Choose Image
                </button>
              </div>
            </div>
            <template v-else>
              <img 
                ref="imageElement"
                :src="uploadedImageUrl"
                alt="Uploaded Image for Detection"
                class="detection-image"
                @load="drawFrame"
              />
              <canvas 
                ref="canvasElement"
                class="detection-canvas"
              ></canvas>
            </template>
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
          <!-- PERSON DETECTION -->
          <div 
            class="ppe-item"
            :class="{ 
              'present': ppeCompliance.person,
              'missing': !ppeCompliance.person && detectionCount > 0
            }"
          >
            <div class="ppe-icon">
              <i class="fas fa-user"></i>
            </div>
            <div class="ppe-info">
              <div class="ppe-name">👤 Person / Body</div>
              <div class="ppe-label">Human Detection</div>
              <div class="ppe-status">
                <span v-if="ppeCompliance.person" class="status-present">
                  <i class="fas fa-check-circle"></i> Detected
                  <span class="confidence">{{ Math.max(
                    ppeStatus.person.confidence * 100
                  ).toFixed(0) }}%</span>
                </span>
                <span v-else class="status-missing">
                  <i class="fas fa-times-circle"></i> Not Detected
                </span>
              </div>
              <div class="ppe-description">Human body identified in frame</div>
            </div>
          </div>

          <!-- HEAD PROTECTION -->
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
              <div class="ppe-name">🧢 Hard Hat / Helmet / Head Protection</div>
              <div class="ppe-label">Head Protection Equipment</div>
              <div class="ppe-status">
                <span v-if="ppeCompliance.hardhat" class="status-present">
                  <i class="fas fa-check-circle"></i> Protected
                  <span class="confidence">{{ Math.max(
                    ppeStatus.hardhat.confidence * 100,
                    ppeStatus.helmet.confidence * 100,
                    ppeStatus.head.confidence * 100
                  ).toFixed(0) }}%</span>
                </span>
                <span v-else class="status-missing">
                  <i class="fas fa-exclamation-triangle"></i> ⚠️ MISSING
                </span>
              </div>
              <div class="ppe-description">Hard hat, helmet, or protective head covering required</div>
              <div class="ppe-variants">
                <span v-if="ppeStatus.hardhat.present" class="variant-badge hardhat">Hard Hat</span>
                <span v-if="ppeStatus.helmet.present" class="variant-badge helmet">Helmet</span>
                <span v-if="ppeStatus.head.present" class="variant-badge head">Head Gear</span>
              </div>
            </div>
          </div>

          <!-- HAND PROTECTION -->
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
              <div class="ppe-name">🧤 Safety Gloves / Hand Protection</div>
              <div class="ppe-label">Hand Protection Equipment</div>
              <div class="ppe-status">
                <span v-if="ppeCompliance.gloves" class="status-present">
                  <i class="fas fa-check-circle"></i> Protected
                  <span class="confidence">{{ Math.max(
                    ppeStatus.gloves.confidence * 100,
                    ppeStatus.hand.confidence * 100
                  ).toFixed(0) }}%</span>
                </span>
                <span v-else class="status-missing">
                  <i class="fas fa-exclamation-triangle"></i> ⚠️ MISSING
                </span>
              </div>
              <div class="ppe-description">Safety gloves or protective hand covering required</div>
              <div class="ppe-variants">
                <span v-if="ppeStatus.gloves.present" class="variant-badge gloves">Gloves</span>
                <span v-if="ppeStatus.hand.present" class="variant-badge hand">Hand Gear</span>
              </div>
            </div>
          </div>

          <!-- BODY PROTECTION -->
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
              <div class="ppe-name">🦺 Safety Vest / Body Protection</div>
              <div class="ppe-label">Body Protection Equipment</div>
              <div class="ppe-status">
                <span v-if="ppeCompliance.vest" class="status-present">
                  <i class="fas fa-check-circle"></i> Protected
                  <span class="confidence">{{ Math.max(
                    ppeStatus.vest.confidence * 100,
                    ppeStatus.safety_vest.confidence * 100
                  ).toFixed(0) }}%</span>
                </span>
                <span v-else class="status-missing">
                  <i class="fas fa-exclamation-triangle"></i> ⚠️ MISSING
                </span>
              </div>
              <div class="ppe-description">High-visibility safety vest or protective body clothing required</div>
              <div class="ppe-variants">
                <span v-if="ppeStatus.vest.present" class="variant-badge vest">Vest</span>
                <span v-if="ppeStatus.safety_vest.present" class="variant-badge safety-vest">Safety Vest</span>
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
            <div class="summary-label">Image Size</div>
            <div class="summary-value">{{ frameWidth }}×{{ frameHeight }}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Status</div>
            <div class="summary-value">{{ uploadedImageUrl ? 'Loaded' : 'Empty' }}</div>
          </div>
        </div>
      </div>
    </div>

    <input 
      ref="fileInput"
      type="file"
      accept="image/*"
      @change="handleFileSelect"
      style="display: none;"
    />
  </div>
</template>

<style scoped>
.image-viewer-container {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.stream-header {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.btn-secondary {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(139, 92, 246, 0.3);
}

.status-badge,
.detection-count,
.resolution-badge {
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

.detection-count {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.resolution-badge {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
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

.image-section {
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
  min-height: 400px;
}

.image-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  max-width: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
  gap: 20px;
  padding: 40px;
}

.empty-icon {
  font-size: 4rem;
  opacity: 0.6;
}

.empty-text h3 {
  margin: 0;
  font-size: 1.5rem;
  color: white;
}

.empty-text p {
  margin: 8px 0 16px 0;
  opacity: 0.8;
  font-size: 0.95rem;
}

.detection-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  height: auto;
  object-fit: contain;
  position: relative;
  z-index: 1;
}

.detection-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  cursor: crosshair;
  pointer-events: none;
  z-index: 2;
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
  align-items: flex-start;
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
  min-width: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 50%;
  color: #6b7280;
  flex-shrink: 0;
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

.ppe-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  margin-bottom: 8px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  display: inline-block;
}

.ppe-status {
  font-size: 0.9rem;
  margin-bottom: 8px;
}

.ppe-description {
  font-size: 0.85rem;
  color: #6b7280;
  font-style: italic;
  margin-bottom: 8px;
  line-height: 1.4;
}

.ppe-variants {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.variant-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}

.variant-badge.hardhat {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: #92400e;
  border-color: #f59e0b;
}

.variant-badge.helmet {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #1e40af;
  border-color: #3b82f6;
}

.variant-badge.head {
  background: linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%);
  color: #6b21a8;
  border-color: #a855f7;
}

.variant-badge.gloves {
  background: linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 100%);
  color: #312e81;
  border-color: #6366f1;
}

.variant-badge.hand {
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
  color: #3730a3;
  border-color: #818cf8;
}

.variant-badge.vest {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #065f46;
  border-color: #10b981;
}

.variant-badge.safety-vest {
  background: linear-gradient(135deg, #bbf7d0 0%, #86efac 100%);
  color: #15803d;
  border-color: #22c55e;
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
  font-weight: 600;
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
