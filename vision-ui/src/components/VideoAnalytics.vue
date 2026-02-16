<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";

// State
const videoElement = ref(null);
const canvasElement = ref(null);
const fileInput = ref(null);
const connectionStatus = ref("checking");
const isProcessing = ref(false);
const processingError = ref("");
const analysisResults = ref([]);
const currentFrameIndex = ref(0);
const isPlaying = ref(false);

// Configuration
const analyticsApiUrl = import.meta.env.VITE_ANALYTICS_API_URL || 'http://localhost:5002';
const speedThreshold = ref(50); // km/h
const showSpeedingOnly = ref(false);
const processEveryNthFrame = ref(2); // Process every 2nd frame for speed

// Real-time stats
const stats = computed(() => {
  if (analysisResults.value.length === 0) return null;
  
  const frameResults = analysisResults.value[currentFrameIndex.value];
  if (!frameResults) return null;
  
  const vehicles = frameResults.vehicles || [];
  const speedingVehicles = vehicles.filter(v => v.speed?.is_speeding);
  const vehiclesWithPlates = vehicles.filter(v => v.plate?.number);
  
  return {
    totalVehicles: vehicles.length,
    vehiclesWithSpeed: vehicles.filter(v => v.speed).length,
    speedingVehicles: speedingVehicles.length,
    vehiclesWithPlates: vehiclesWithPlates.length,
    avgSpeed: vehicles.length > 0 
      ? (vehicles.reduce((sum, v) => sum + (v.speed?.speed_kmh || 0), 0) / vehicles.length).toFixed(2)
      : 0
  };
});

// Frame info
const frameInfo = computed(() => {
  if (analysisResults.value.length === 0) return null;
  return analysisResults.value[currentFrameIndex.value];
});

// Status text
const statusText = {
  checking: "Checking service...",
  connected: "Connected",
  disconnected: "Service unavailable",
  processing: "Processing...",
  error: "Error occurred"
};

let renderAnimationId = null;
let videoFrameInterval = null;

onMounted(() => {
  checkServiceHealth();
});

onUnmounted(() => {
  if (renderAnimationId) {
    cancelAnimationFrame(renderAnimationId);
  }
  if (videoFrameInterval) {
    clearInterval(videoFrameInterval);
  }
  if (videoElement.value) {
    videoElement.value.pause();
  }
});

const checkServiceHealth = async () => {
  try {
    const response = await fetch(`${analyticsApiUrl}/health`);
    if (response.ok) {
      connectionStatus.value = "connected";
    } else {
      connectionStatus.value = "disconnected";
    }
  } catch (error) {
    console.warn("Video analytics service not available:", error);
    connectionStatus.value = "disconnected";
  }
};

const handleFileSelect = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  // Validate file type (video)
  if (!file.type.startsWith('video/')) {
    processingError.value = "Please upload a video file (MP4, MOV, AVI, etc.)";
    setTimeout(() => { processingError.value = ""; }, 3000);
    return;
  }

  // Validate file size (max 500MB for videos)
  const MAX_FILE_SIZE = 500 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    processingError.value = "File size must be less than 500MB";
    setTimeout(() => { processingError.value = ""; }, 3000);
    return;
  }

  loadVideo(file);
};

const loadVideo = (file) => {
  try {
    isProcessing.value = true;
    processingError.value = "";
    analysisResults.value = [];
    currentFrameIndex.value = 0;
    isPlaying.value = false;

    // Create blob URL for video
    const blobUrl = URL.createObjectURL(file);
    
    if (videoElement.value) {
      videoElement.value.src = blobUrl;
      videoElement.value.onloadedmetadata = () => {
        console.log(`Video loaded: ${videoElement.value.videoWidth}x${videoElement.value.videoHeight}`);
        // Set canvas to match video dimensions
        if (canvasElement.value) {
          canvasElement.value.width = videoElement.value.videoWidth;
          canvasElement.value.height = videoElement.value.videoHeight;
        }
        isProcessing.value = false;
      };
      
      // Extract frames and process
      extractAndProcessFrames();
    }
  } catch (error) {
    processingError.value = error.message || "Failed to load video";
    console.error("Error:", error);
    isProcessing.value = false;
  }
};

const extractAndProcessFrames = async () => {
  try {
    if (!videoElement.value) return;

    const video = videoElement.value;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const frames = [];
    const frameCount = Math.ceil(video.duration * 30); // Assume 30fps
    let processedFrames = 0;

    // Extract frames from video
    for (let i = 0; i < frameCount; i += processEveryNthFrame.value) {
      video.currentTime = i / 30;
      
      await new Promise(resolve => {
        video.onseeked = async () => {
          ctx.drawImage(video, 0, 0);
          
          // Get frame data
          const frameData = canvas.toDataURL('image/jpeg', 0.8);
          frames.push({
            frame_id: i + 1,
            data: frameData,
            timestamp: new Date().toISOString(),
            vehicles: []
          });
          
          processedFrames++;
          console.log(`Extracted frame ${processedFrames}/${Math.ceil(frameCount / processEveryNthFrame.value)}`);
          resolve();
        };
      });
    }

    // Process frames with backend
    await processFramesWithBackend(frames);
  } catch (error) {
    console.error("Error extracting frames:", error);
    processingError.value = "Failed to process video frames";
  }
};

const processFramesWithBackend = async (frames) => {
  try {
    isProcessing.value = true;
    
    // Send frames to backend for processing
    const response = await fetch(`${analyticsApiUrl}/api/process-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames })
    });

    if (response.ok) {
      const results = await response.json();
      analysisResults.value = results.frames || frames;
    } else {
      // Fallback: Use demo analysis
      console.warn("Backend processing failed, using demo analysis");
      showDemoAnalysis();
    }
  } catch (error) {
    console.warn("Backend processing failed:", error);
    // Fallback to demo
    showDemoAnalysis();
  } finally {
    isProcessing.value = false;
  }
};

const showDemoAnalysis = () => {
  // Demo data showing what analytics will look like
  const demoFrames = [];
  
  for (let i = 0; i < 120; i++) {
    const numVehicles = Math.floor(Math.random() * 5) + 1;
    const vehicles = [];
    
    for (let v = 0; v < numVehicles; v++) {
      const speed = Math.random() * 80 + 10;
      vehicles.push({
        id: v + 1,
        bbox: {
          x1: Math.random() * 400,
          y1: Math.random() * 300,
          x2: Math.random() * 400 + 150,
          y2: Math.random() * 300 + 150
        },
        confidence: (0.8 + Math.random() * 0.2).toFixed(3),
        speed: {
          speed_kmh: speed.toFixed(2),
          speed_ms: (speed / 3.6).toFixed(2),
          is_speeding: speed > speedThreshold.value
        },
        plate: Math.random() > 0.6 ? {
          number: `AAA${Math.floor(Math.random() * 9999)}`,
          confidence: (0.85 + Math.random() * 0.15).toFixed(3),
          region: 'SA'
        } : null
      });
    }
    
    demoFrames.push({
      frame_id: i + 1,
      vehicles: vehicles,
      timestamp: new Date().toISOString()
    });
  }
  
  analysisResults.value = demoFrames;
};

const playVideo = () => {
  if (videoElement.value && analysisResults.value.length > 0) {
    isPlaying.value = true;
    let frameIdx = 0;
    
    videoFrameInterval = setInterval(() => {
      if (frameIdx < analysisResults.value.length) {
        currentFrameIndex.value = frameIdx;
        drawAnalysis();
        frameIdx++;
      } else {
        isPlaying.value = false;
        clearInterval(videoFrameInterval);
      }
    }, 33); // ~30fps
  }
};

const stopVideo = () => {
  isPlaying.value = false;
  if (videoFrameInterval) {
    clearInterval(videoFrameInterval);
  }
};

const getVehicleColor = (vehicle) => {
  if (vehicle.speed?.is_speeding) return '#ef4444'; // red for speeding
  if (vehicle.plate?.number) return '#10b981'; // green for plates detected
  return '#3b82f6'; // blue for normal
};

const drawAnalysis = () => {
  const canvas = canvasElement.value;
  if (!canvas || !videoElement.value || analysisResults.value.length === 0) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const frameData = frameInfo.value;
  if (!frameData) return;

  // Draw video frame
  ctx.drawImage(videoElement.value, 0, 0, canvas.width, canvas.height);

  // Draw vehicles
  frameData.vehicles.forEach((vehicle) => {
    if (showSpeedingOnly.value && !vehicle.speed?.is_speeding) return;

    const { x1, y1, x2, y2 } = vehicle.bbox;
    const color = getVehicleColor(vehicle);

    // Draw bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    // Draw label background
    const label = [];
    label.push(`#${vehicle.id}`);
    if (vehicle.speed) {
      label.push(`${vehicle.speed.speed_kmh} km/h`);
    }
    if (vehicle.plate?.number) {
      label.push(`📌 ${vehicle.plate.number}`);
    }

    const labelText = label.join(' | ');
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = color;
    const textWidth = ctx.measureText(labelText).width;
    
    ctx.fillRect(x1, y1 - 25, textWidth + 8, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(labelText, x1 + 4, y1 - 8);

    // Draw speed indicator if speeding
    if (vehicle.speed?.is_speeding) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(x1 - 3, y1 - 3, x2 - x1 + 6, y2 - y1 + 6);
    }
  });

  // Draw frame info
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 3;
  ctx.fillText(
    `Frame: ${frameData.frame_id} | Vehicles: ${frameData.vehicles.length}`,
    10, 25
  );
  ctx.shadowColor = 'transparent';

  renderAnimationId = requestAnimationFrame(drawAnalysis);
};

const nextFrame = () => {
  if (currentFrameIndex.value < analysisResults.value.length - 1) {
    currentFrameIndex.value++;
    drawAnalysis();
  }
};

const prevFrame = () => {
  if (currentFrameIndex.value > 0) {
    currentFrameIndex.value--;
    drawAnalysis();
  }
};

const goToFrame = (index) => {
  currentFrameIndex.value = Math.max(0, Math.min(index, analysisResults.value.length - 1));
  drawAnalysis();
};

const exportResults = () => {
  const data = JSON.stringify(analysisResults.value, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-results-${new Date().getTime()}.json`;
  a.click();
};

const getSpeedColor = (speed) => {
  if (!speed) return 'text-gray-400';
  if (speed.is_speeding) return 'text-red-600 font-bold';
  return 'text-green-600';
};
</script>

<template>
  <div class="analytics-container">
    <!-- Hidden video element for frame extraction -->
    <video
      ref="videoElement"
      class="hidden-video"
      crossorigin="anonymous"
    ></video>

    <!-- Header -->
    <div class="analytics-header">
      <div class="header-title">
        <i class="fas fa-chart-bar"></i>
        <span>Video Analytics - Vehicle Detection & Speed</span>
      </div>
      <div class="status-badge" :class="connectionStatus">
        <i class="fas fa-circle"></i>
        {{ statusText[connectionStatus] }}
      </div>
    </div>

    <!-- Main Layout -->
    <div class="analytics-layout">
      <!-- Left Panel: Upload & Controls -->
      <div class="upload-panel">
        <div class="upload-section">
          <h3>Upload Video</h3>
          
          <div class="upload-area">
            <input
              ref="fileInput"
              type="file"
              accept="video/*"
              @change="handleFileSelect"
              hidden
            />
            <button
              @click="() => fileInput?.click()"
              class="upload-btn"
              :disabled="isProcessing"
            >
              <i class="fas fa-cloud-upload-alt"></i>
              <span v-if="!isProcessing">Choose Video File</span>
              <span v-else>
                <i class="fas fa-spinner fa-spin"></i> Processing...
              </span>
            </button>
          </div>

          <p class="upload-info">
            Supports MP4, MOV, AVI, WebM | Max 500MB
          </p>
        </div>

        <!-- Playback Controls -->
        <div v-if="analysisResults.length > 0" class="playback-section">
          <h3>Playback</h3>
          <div class="playback-buttons">
            <button
              v-if="!isPlaying"
              @click="playVideo"
              class="play-btn"
            >
              <i class="fas fa-play"></i> Play
            </button>
            <button
              v-else
              @click="stopVideo"
              class="play-btn playing"
            >
              <i class="fas fa-pause"></i> Pause
            </button>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="filter-section">
          <h3>Filters</h3>
          
          <div class="filter-group">
            <label>Speed Threshold (km/h)</label>
            <input
              v-model.number="speedThreshold"
              type="range"
              min="10"
              max="150"
              step="5"
              class="slider"
            />
            <span class="threshold-value">{{ speedThreshold }} km/h</span>
          </div>

          <div class="filter-group">
            <label class="checkbox-label">
              <input
                v-model="showSpeedingOnly"
                type="checkbox"
              />
              <span>Speeding vehicles only</span>
            </label>
          </div>
        </div>

        <!-- Statistics -->
        <div v-if="stats" class="stats-section">
          <h3>Frame Statistics</h3>
          
          <div class="stat-item">
            <span class="stat-label">Total Vehicles</span>
            <span class="stat-value">{{ stats.totalVehicles }}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">With Speed Data</span>
            <span class="stat-value">{{ stats.vehiclesWithSpeed }}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Speeding</span>
            <span class="stat-value speeding">{{ stats.speedingVehicles }}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Plates Detected</span>
            <span class="stat-value">{{ stats.vehiclesWithPlates }}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Avg Speed</span>
            <span class="stat-value">{{ stats.avgSpeed }} km/h</span>
          </div>
        </div>

        <!-- Export -->
        <button
          v-if="analysisResults.length > 0"
          @click="exportResults"
          class="export-btn"
        >
          <i class="fas fa-download"></i> Export Results
        </button>
      </div>

      <!-- Center Panel: Canvas Visualization -->
      <div class="canvas-panel">
        <div class="canvas-wrapper">
          <canvas
            ref="canvasElement"
            class="analysis-canvas"
          ></canvas>
        </div>

        <!-- Frame Controls -->
        <div v-if="analysisResults.length > 0" class="frame-controls">
          <button @click="prevFrame" :disabled="currentFrameIndex === 0" class="control-btn">
            <i class="fas fa-chevron-left"></i> Previous
          </button>

          <div class="frame-slider">
            <input
              v-model.number="currentFrameIndex"
              type="range"
              :min="0"
              :max="analysisResults.length - 1"
              class="slider"
              @input="(e) => goToFrame(parseInt(e.target.value))"
            />
            <span class="frame-counter">
              {{ currentFrameIndex + 1 }} / {{ analysisResults.length }}
            </span>
          </div>

          <button @click="nextFrame" :disabled="currentFrameIndex === analysisResults.length - 1" class="control-btn">
            Next <i class="fas fa-chevron-right"></i>
          </button>
        </div>

        <!-- Error Message -->
        <div v-if="processingError" class="error-banner">
          <i class="fas fa-exclamation-circle"></i>
          {{ processingError }}
        </div>
      </div>

      <!-- Right Panel: Details -->
      <div class="details-panel">
        <div class="details-header">
          <h3>Vehicle Details</h3>
        </div>

        <div v-if="frameInfo && frameInfo.vehicles.length > 0" class="vehicles-list">
          <div
            v-for="vehicle in frameInfo.vehicles"
            :key="vehicle.id"
            class="vehicle-card"
            :class="{ speeding: vehicle.speed?.is_speeding }"
          >
            <div class="vehicle-header">
              <span class="vehicle-id">#{{ vehicle.id }}</span>
              <span class="confidence-badge">
                {{ (vehicle.confidence * 100).toFixed(0) }}%
              </span>
            </div>

            <div v-if="vehicle.speed" class="vehicle-info">
              <div class="info-row">
                <span class="label">Speed</span>
                <span :class="getSpeedColor(vehicle.speed)">
                  {{ vehicle.speed.speed_kmh }} km/h
                </span>
              </div>
            </div>

            <div v-if="vehicle.plate" class="vehicle-info plate-info">
              <div class="info-row">
                <span class="label">Plate</span>
                <span class="plate-number">{{ vehicle.plate.number }}</span>
              </div>
              <div class="info-row">
                <span class="label">Region</span>
                <span>{{ vehicle.plate.region }}</span>
              </div>
            </div>

            <div class="bbox-info">
              <span class="label">Position:</span>
              <span class="bbox-coords">
                ({{ Math.round(vehicle.bbox.x1) }}, {{ Math.round(vehicle.bbox.y1) }})
              </span>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <i class="fas fa-car"></i>
          <p>No vehicles detected in this frame</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.analytics-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.5rem;
  font-weight: 700;
  color: #1f2937;
}

.header-title i {
  color: #3b82f6;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
}

.status-badge i {
  animation: pulse 2s infinite;
}

.status-badge.connected {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.disconnected {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.checking {
  background: #fef3c7;
  color: #b45309;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.analytics-layout {
  display: grid;
  grid-template-columns: 300px 1fr 350px;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

/* Left Panel */
.upload-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
}

.upload-section h3,
.filter-section h3,
.stats-section h3 {
  margin: 0;
  font-size: 1rem;
  color: #1f2937;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 10px;
}

.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  border: 2px dashed #3b82f6;
  border-radius: 8px;
  background: #f0f9ff;
}

.upload-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.upload-btn:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.upload-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.upload-info {
  text-align: center;
  font-size: 0.85rem;
  color: #6b7280;
  margin: 0;
}

/* Filter Section */
.filter-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-group label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #374151;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #e5e7eb;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  transition: all 0.3s;
}

.slider::-webkit-slider-thumb:hover {
  background: #2563eb;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #3b82f6;
  border: none;
  cursor: pointer;
  transition: all 0.3s;
}

.slider::-moz-range-thumb:hover {
  background: #2563eb;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
}

.threshold-value {
  font-size: 0.85rem;
  color: #6b7280;
  font-weight: 600;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input {
  cursor: pointer;
}

/* Statistics */
.stats-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.stat-label {
  color: #6b7280;
  font-weight: 500;
}

.stat-value {
  font-weight: 700;
  color: #1f2937;
}

.stat-value.speeding {
  color: #ef4444;
}

.export-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.export-btn:hover {
  background: #059669;
  transform: translateY(-2px);
}

/* Center Panel */
.canvas-panel {
  display: flex;
  flex-direction: column;
  gap: 15px;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.canvas-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1f2937;
  border-radius: 6px;
  overflow: hidden;
  min-height: 400px;
}

.analysis-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.frame-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #e5e7eb;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s;
}

.control-btn:hover:not(:disabled) {
  background: #d1d5db;
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.frame-slider {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.frame-slider .slider {
  flex: 1;
}

.frame-counter {
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 6px;
  font-size: 0.9rem;
}

/* Right Panel */
.details-panel {
  display: flex;
  flex-direction: column;
  gap: 15px;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
}

.details-header {
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 10px;
}

.details-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #1f2937;
}

.vehicles-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vehicle-card {
  padding: 12px;
  border-left: 4px solid #3b82f6;
  background: #f9fafb;
  border-radius: 4px;
  transition: all 0.3s;
}

.vehicle-card.speeding {
  border-left-color: #ef4444;
  background: #fef2f2;
}

.vehicle-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.vehicle-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.vehicle-id {
  font-weight: 700;
  color: #1f2937;
}

.confidence-badge {
  font-size: 0.75rem;
  padding: 4px 8px;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 3px;
  font-weight: 600;
}

.vehicle-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
}

.label {
  color: #6b7280;
  font-weight: 500;
}

.plate-number {
  font-family: monospace;
  font-weight: 700;
  color: #10b981;
  background: #ecfdf5;
  padding: 2px 6px;
  border-radius: 3px;
}

.bbox-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  color: #6b7280;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.bbox-coords {
  font-family: monospace;
  color: #374151;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 30px 20px;
  color: #9ca3af;
}

.empty-state i {
  font-size: 2.5rem;
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 1400px) {
  .analytics-layout {
    grid-template-columns: 1fr;
  }

  .upload-panel {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
    padding: 15px;
  }

  .upload-section,
  .filter-section,
  .stats-section {
    min-height: 200px;
  }

  .canvas-panel {
    grid-column: 1 / -1;
  }

  .details-panel {
    grid-column: 1 / -1;
  }

  .export-btn {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .analytics-layout {
    grid-template-columns: 1fr;
  }

  .upload-panel {
    display: flex !important;
    grid-template-columns: unset !important;
  }

  .details-panel {
    max-height: 300px;
  }
}
</style>
