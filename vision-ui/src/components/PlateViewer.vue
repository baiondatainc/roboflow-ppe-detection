<script setup>
import { ref, onMounted, onUnmounted } from "vue";

// State
const imageElement = ref(null);
const canvasElement = ref(null);
const fileInput = ref(null);
const connectionStatus = ref("ready");
const isProcessing = ref(false);
const processingError = ref("");
const uploadedImageUrl = ref("");
const plateResults = ref([]);

// Configuration from environment
const plateApiUrl = import.meta.env.VITE_PLATE_API_URL || 'http://localhost:5001';

// Frame dimensions
const frameWidth = ref(640);
const frameHeight = ref(480);

// Plate detection details
const plateDetails = ref({
  totalPlates: 0,
  processingTime: 0,
  detectedPlates: [],
  vehicles: []
});

const statusText = {
  ready: "Ready - Upload an image",
  processing: "Processing...",
  error: "Error occurred"
};

let renderAnimationId = null;

onMounted(() => {
  checkServiceHealth();
});

onUnmounted(() => {
  if (renderAnimationId) {
    cancelAnimationFrame(renderAnimationId);
  }
});

const checkServiceHealth = async () => {
  try {
    const response = await fetch(`${plateApiUrl}/health`);
    if (response.ok) {
      connectionStatus.value = "connected";
    }
  } catch (error) {
    console.warn("Plate service not available:", error);
    connectionStatus.value = "disconnected";
  }
};

const handleFileSelect = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    processingError.value = "Please upload an image file (JPG, PNG, etc.)";
    setTimeout(() => { processingError.value = ""; }, 3000);
    return;
  }

  // Validate file size (max 50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    processingError.value = "File size must be less than 50MB";
    setTimeout(() => { processingError.value = ""; }, 3000);
    return;
  }

  processImage(file);
};

const processImage = async (file) => {
  try {
    isProcessing.value = true;
    processingError.value = "";
    plateResults.value = [];
    plateDetails.value = {
      totalPlates: 0,
      processingTime: 0,
      detectedPlates: [],
      vehicles: []
    };

    // Load image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImageUrl.value = e.target?.result || "";
      startRenderLoop();
    };
    reader.onerror = () => {
      processingError.value = "Failed to read image file";
      isProcessing.value = false;
    };
    reader.readAsDataURL(file);

    // Send to backend
    const response = await fetch(`${plateApiUrl}/api/detect-plate`, {
      method: 'POST',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Detection failed');
    }

    handleDetectionResults(data);

  } catch (error) {
    console.error("❌ Error processing image:", error);
    processingError.value = `Error: ${error.message}`;
    isProcessing.value = false;
    uploadedImageUrl.value = "";
  }
};

const handleDetectionResults = (data) => {
  console.log('📋 Plate detection results:', data);

  frameWidth.value = data.image_width || 640;
  frameHeight.value = data.image_height || 480;

  plateResults.value = data.results || [];

  // Process plate details
  const detectedPlates = [];
  const vehicles = [];

  (data.results || []).forEach((result, index) => {
    detectedPlates.push({
      id: index,
      plate: result.plate || 'Unknown',
      confidence: result.score || 0,
      region: result.region?.code || 'Unknown',
      regionScore: result.region?.score || 0,
      candidates: result.candidates || [],
      box: result.box
    });

    if (result.vehicle) {
      vehicles.push({
        id: index,
        type: result.vehicle.type || 'Unknown',
        confidence: result.vehicle.score || 0,
        box: result.vehicle.box
      });
    }
  });

  plateDetails.value = {
    totalPlates: detectedPlates.length,
    processingTime: data.processing_time || 0,
    detectedPlates,
    vehicles
  };

  isProcessing.value = false;
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

  // Canvas size should match image
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw bounding boxes for plates
  plateResults.value.forEach((result) => {
    if (result.box) {
      const box = result.box;
      const x = box.xmin;
      const y = box.ymin;
      const width = box.xmax - box.xmin;
      const height = box.ymax - box.ymin;

      // Draw plate box
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Draw plate text background
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 14px Arial';
      const text = `${result.plate} (${(result.score * 100).toFixed(1)}%)`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(x, y - 25, textWidth + 8, 24);

      // Draw plate text
      ctx.fillStyle = 'white';
      ctx.fillText(text, x + 4, y - 8);
    }

    // Draw vehicle box if present
    if (result.vehicle && result.vehicle.box) {
      const box = result.vehicle.box;
      const x = box.xmin;
      const y = box.ymin;
      const width = box.xmax - box.xmin;
      const height = box.ymax - box.ymin;

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);

      // Draw vehicle type
      ctx.fillStyle = '#3b82f6';
      const vehicleText = `${result.vehicle.type}`;
      const vehicleWidth = ctx.measureText(vehicleText).width;
      ctx.fillRect(x, y + height + 5, vehicleWidth + 8, 22);

      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(vehicleText, x + 4, y + height + 22);
    }
  });
};

const clearImage = () => {
  stopRenderLoop();
  uploadedImageUrl.value = "";
  plateResults.value = [];
  plateDetails.value = {
    totalPlates: 0,
    processingTime: 0,
    detectedPlates: [],
    vehicles: []
  };
  processingError.value = "";
  isProcessing.value = false;
  if (fileInput.value) {
    fileInput.value.value = "";
  }
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    // Show feedback
    console.log("Copied:", text);
  });
};
</script>

<template>
  <div class="plate-viewer-container">
    <div class="viewer-header">
      <h2><i class="fas fa-car"></i> License Plate Detection</h2>
      <div class="status-badge" :class="connectionStatus">
        <i class="fas fa-circle"></i>
        {{ connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'disconnected' ? 'Offline' : 'Ready' }}
      </div>
    </div>

    <div class="controls-section">
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
          class="btn btn-danger"
          :disabled="isProcessing"
        >
          <i class="fas fa-trash"></i> Clear
        </button>
      </div>

      <div class="control-info">
        <span v-if="isProcessing" class="status-badge-small processing">
          <i class="fas fa-spinner fa-spin"></i> PROCESSING
        </span>
        <span v-else class="status-badge-small idle">
          <i class="fas fa-check-circle"></i> READY
        </span>
        <span v-if="plateDetails.totalPlates > 0" class="badge-info">
          <i class="fas fa-car"></i> {{ plateDetails.totalPlates }} Plate(s)
        </span>
        <span class="resolution-badge">
          <i class="fas fa-image"></i> {{ frameWidth }}×{{ frameHeight }}
        </span>
      </div>

      <div v-if="processingError" class="error-message">
        <i class="fas fa-exclamation-circle"></i> {{ processingError }}
      </div>
    </div>

    <div class="main-content">
      <div class="image-section">
        <div class="canvas-wrapper">
          <div class="image-container" v-if="uploadedImageUrl">
            <img 
              ref="imageElement"
              :src="uploadedImageUrl"
              alt="Uploaded Image"
              class="detection-image"
              @load="drawFrame"
            />
            <canvas 
              ref="canvasElement"
              class="detection-canvas"
            ></canvas>
          </div>
          <div v-else class="empty-state">
            <div class="empty-icon">
              <i class="fas fa-car"></i>
            </div>
            <div class="empty-text">
              <h3>Upload a Car Image</h3>
              <p>Click "Upload Image" to detect license plates</p>
            </div>
          </div>
        </div>
      </div>

      <div class="details-panel">
        <div class="panel-header">
          <h3><i class="fas fa-list"></i> Detection Results</h3>
          <div class="plate-badge">
            {{ plateDetails.totalPlates }} Found
          </div>
        </div>

        <!-- Processing Time -->
        <div v-if="plateDetails.processingTime > 0" class="info-card">
          <div class="info-label">Processing Time</div>
          <div class="info-value">{{ plateDetails.processingTime.toFixed(2) }}ms</div>
        </div>

        <!-- Detected Plates -->
        <div v-if="plateDetails.detectedPlates.length > 0" class="section">
          <h4 class="section-title"><i class="fas fa-hashtag"></i> License Plates</h4>
          <div class="plate-list">
            <div 
              v-for="plate in plateDetails.detectedPlates"
              :key="plate.id"
              class="plate-item"
            >
              <div class="plate-number">
                <div class="plate-display">{{ plate.plate }}</div>
                <div class="plate-confidence">
                  {{ (plate.confidence * 100).toFixed(1) }}%
                </div>
              </div>
              <div class="plate-info">
                <div class="info-row">
                  <span class="label">Region:</span>
                  <span class="value">{{ plate.region }}</span>
                </div>
                <div class="info-row">
                  <span class="label">Score:</span>
                  <span class="value">{{ (plate.regionScore * 100).toFixed(1) }}%</span>
                </div>
              </div>
              <button 
                @click="copyToClipboard(plate.plate)"
                class="copy-btn"
                title="Copy plate number"
              >
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Vehicle Details -->
        <div v-if="plateDetails.vehicles.length > 0" class="section">
          <h4 class="section-title"><i class="fas fa-car"></i> Vehicles</h4>
          <div class="vehicle-list">
            <div 
              v-for="vehicle in plateDetails.vehicles"
              :key="vehicle.id"
              class="vehicle-item"
            >
              <div class="vehicle-type">{{ vehicle.type }}</div>
              <div class="vehicle-confidence">
                {{ (vehicle.confidence * 100).toFixed(1) }}%
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="plateDetails.totalPlates === 0 && uploadedImageUrl" class="section">
          <div class="no-results">
            <i class="fas fa-search"></i>
            <p>No license plates detected</p>
          </div>
        </div>
      </div>
    </div>

    <input 
      ref="fileInput"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleFileSelect"
    />
  </div>
</template>

<style scoped>
.plate-viewer-container {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.viewer-header {
  background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
  color: white;
  padding: 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.viewer-header h2 {
  font-size: 1.8rem;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
}

.status-badge i {
  animation: pulse 2s infinite;
}

.status-badge.connected i {
  color: #10b981;
}

.status-badge.disconnected i {
  color: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

.controls-section {
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
  opacity: 0.6;
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

.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);
}

.status-badge-small {
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.status-badge-small.processing {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.status-badge-small.idle {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
  color: white;
}

.badge-info {
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.resolution-badge {
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: white;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
}

.empty-text p {
  margin: 8px 0;
  opacity: 0.8;
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

.details-panel {
  width: 380px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  max-height: 700px;
  overflow-y: auto;
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
  font-size: 1.1rem;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 10px;
}

.plate-badge {
  padding: 6px 12px;
  background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
  color: white;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
}

.info-card {
  padding: 15px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.info-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.info-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.section {
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.section-title {
  margin: 0 0 15px 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plate-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plate-item {
  padding: 15px;
  border: 2px solid #1e40af;
  border-radius: 8px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  display: flex;
  align-items: center;
  gap: 12px;
}

.plate-number {
  flex-shrink: 0;
}

.plate-display {
  font-size: 1.4rem;
  font-weight: 900;
  color: #1e40af;
  font-family: 'Courier New', monospace;
  letter-spacing: 2px;
  text-align: center;
  min-width: 80px;
  padding: 8px;
  background: white;
  border: 2px solid #1e40af;
  border-radius: 4px;
}

.plate-confidence {
  font-size: 0.75rem;
  color: #059669;
  font-weight: 700;
  text-align: center;
  margin-top: 4px;
}

.plate-info {
  flex: 1;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-bottom: 4px;
}

.info-row .label {
  color: #6b7280;
  font-weight: 600;
}

.info-row .value {
  color: #1f2937;
  font-weight: 500;
}

.copy-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: #1e40af;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: #1e3a8a;
  transform: scale(1.05);
}

.vehicle-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vehicle-item {
  padding: 12px 15px;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
}

.vehicle-type {
  font-size: 1rem;
  font-weight: 700;
  color: #1e40af;
}

.vehicle-confidence {
  font-size: 0.8rem;
  color: #6b7280;
  margin-top: 4px;
}

.no-results {
  text-align: center;
  padding: 30px 20px;
  color: #6b7280;
}

.no-results i {
  font-size: 2rem;
  margin-bottom: 10px;
  opacity: 0.5;
}

@media (max-width: 1400px) {
  .main-content {
    flex-direction: column;
  }
  
  .details-panel {
    width: 100%;
  }
}
</style>
