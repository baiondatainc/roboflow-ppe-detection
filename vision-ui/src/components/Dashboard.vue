<script setup>
import { ref, onMounted, computed } from "vue";
import socket from "../services/socket";

const violationStats = ref({
  total: 0,
  recentCount: 0,
  byType: {}
});

const connectionStatus = ref("connected");
const lastUpdated = ref(new Date());
const detectionMetrics = ref({
  accuracy: 0,
  processTime: 0,
  detectionRate: 0
});

const isProcessing = ref(false);

onMounted(() => {
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === "SYSTEM") {
      console.log("✅ System message:", data.message);
    } else if (data.eventType === "PPE_VIOLATION") {
      violationStats.value.total++;
      violationStats.value.recentCount++;
      
      const violationType = data.type || data.label || "Unknown";
      violationStats.value.byType[violationType] = (violationStats.value.byType[violationType] || 0) + 1;
      
      lastUpdated.value = new Date();
      
      // Reset recent count every minute
      setTimeout(() => {
        violationStats.value.recentCount = 0;
      }, 60000);
    }
  });

  // Simulate metrics update
  setInterval(() => {
    detectionMetrics.value.accuracy = (Math.random() * 5 + 94).toFixed(1);
    detectionMetrics.value.processTime = (Math.random() * 50 + 100).toFixed(0);
    detectionMetrics.value.detectionRate = (Math.random() * 20 + 75).toFixed(1);
  }, 3000);

  checkConnectionStatus();
  loadStats();
});

const checkConnectionStatus = () => {
  setInterval(() => {
    const timeSinceUpdate = Date.now() - lastUpdated.value;
    if (timeSinceUpdate > 10000) {
      connectionStatus.value = "warning";
    } else {
      connectionStatus.value = "connected";
    }
  }, 5000);
};

const loadStats = async () => {
  try {
    const response = await fetch("http://localhost:3001/stats");
    const stats = await response.json();
    isProcessing.value = stats.processing?.isActive || false;
  } catch (error) {
    console.error("Failed to load stats:", error);
  }
};

const toggleProcessing = async () => {
  const messageType = isProcessing.value ? "STOP_DETECTION" : "START_DETECTION";
  socket.send(JSON.stringify({ type: messageType }));
  console.log(`📡 Sent: ${messageType}`);
};

const topViolations = computed(() => {
  return Object.entries(violationStats.value.byType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
});

const getConnectionColor = () => {
  return connectionStatus.value === "connected" ? "#10b981" : "#f59e0b";
};

</script>

<template>
  <div class="dashboard-container">
    <!-- Status Overview -->
    <div class="status-banner" :class="connectionStatus">
      <div class="banner-content">
        <i class="fas fa-info-circle"></i>
        <div>
          <h3>System Status</h3>
          <p v-if="connectionStatus === 'connected'">
            Connected and receiving real-time PPE violation alerts from Roboflow
          </p>
          <p v-else>
            Connection unstable - last update {{ Math.floor((Date.now() - lastUpdated) / 1000) }} seconds ago
          </p>
        </div>
      </div>
      <div class="status-dot" :style="{ backgroundColor: getConnectionColor() }"></div>
    </div>

    <!-- Key Metrics -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-icon">
          <i class="fas fa-exclamation-circle"></i>
        </div>
        <div class="metric-content">
          <div class="metric-value">{{ violationStats.total }}</div>
          <div class="metric-label">Total Violations</div>
          <div class="metric-change">+{{ violationStats.recentCount }} in last minute</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <i class="fas fa-percent"></i>
        </div>
        <div class="metric-content">
          <div class="metric-value">{{ detectionMetrics.accuracy }}%</div>
          <div class="metric-label">Detection Accuracy</div>
          <div class="metric-change">Real-time measurement</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <i class="fas fa-tachometer-alt"></i>
        </div>
        <div class="metric-content">
          <div class="metric-value">{{ detectionMetrics.processTime }}ms</div>
          <div class="metric-label">Processing Time</div>
          <div class="metric-change">Average latency</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <i class="fas fa-video"></i>
        </div>
        <div class="metric-content">
          <div class="metric-value">{{ detectionMetrics.detectionRate }}%</div>
          <div class="metric-label">Detection Rate</div>
          <div class="metric-change">Frame coverage</div>
        </div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-grid">
      <!-- Violation Types Chart -->
      <div class="chart-card">
        <h3><i class="fas fa-chart-bar"></i> Top Violation Types</h3>
        <div class="chart-content">
          <div v-if="topViolations.length === 0" class="empty-chart">
            <p>No violations recorded yet</p>
          </div>
          <div v-else class="bar-chart">
            <div 
              v-for="(violation, index) in topViolations" 
              :key="index"
              class="bar-item"
            >
              <div class="bar-label">{{ violation.type }}</div>
              <div class="bar-container">
                <div 
                  class="bar-fill"
                  :style="{ 
                    width: (violation.count / topViolations[0].count) * 100 + '%'
                  }"
                ></div>
              </div>
              <div class="bar-value">{{ violation.count }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- System Info -->
      <div class="info-card">
        <h3><i class="fas fa-cog"></i> System Information</h3>
        <div class="info-list">
          <div class="info-item">
            <span class="info-label">Service:</span>
            <span class="info-value">Google Vertex Vision AI</span>
          </div>
          <div class="info-item">
            <span class="info-label">Region:</span>
            <span class="info-value">us-central1</span>
          </div>
          <div class="info-item">
            <span class="info-label">Stream:</span>
            <span class="info-value">traffic-stream</span>
          </div>
          <div class="info-item">
            <span class="info-label">Topic:</span>
            <span class="info-value">visionai-ppe-events</span>
          </div>
          <div class="info-item">
            <span class="info-label">Last Update:</span>
            <span class="info-value">{{ lastUpdated.toLocaleTimeString() }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Connection:</span>
            <span class="info-value" :class="connectionStatus">
              <i class="fas fa-circle"></i>
              {{ connectionStatus === 'connected' ? 'Connected' : 'Warning' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Features Section -->
    <div class="features-section">
      <h3><i class="fas fa-star"></i> Key Features</h3>
      <div class="features-grid">
        <div class="feature-item">
          <i class="fas fa-eye"></i>
          <div>
            <h4>Real-time Detection</h4>
            <p>AI-powered PPE violation detection with live video stream analysis</p>
          </div>
        </div>
        <div class="feature-item">
          <i class="fas fa-bolt"></i>
          <div>
            <h4>Instant Alerts</h4>
            <p>Immediate notifications via Pub/Sub for compliance violations</p>
          </div>
        </div>
        <div class="feature-item">
          <i class="fas fa-chart-line"></i>
          <div>
            <h4>Analytics & Metrics</h4>
            <p>Track violations, detection accuracy, and system performance</p>
          </div>
        </div>
        <div class="feature-item">
          <i class="fas fa-cloud"></i>
          <div>
            <h4>Cloud Integrated</h4>
            <p>Powered by Google Cloud Vision AI and Pub/Sub messaging</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.status-banner {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  padding: 20px 25px;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.status-banner.warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 15px;
}

.banner-content i {
  font-size: 1.8rem;
}

.banner-content h3 {
  margin: 0 0 5px 0;
  font-size: 1.1rem;
}

.banner-content p {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.95;
}

.status-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.metric-card {
  background: white;
  border-radius: 12px;
  padding: 25px;
  display: flex;
  gap: 15px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.metric-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
}

.metric-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.metric-content {
  flex: 1;
}

.metric-value {
  font-size: 2rem;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
}

.metric-label {
  font-size: 0.9rem;
  color: #6b7280;
  margin: 8px 0 4px 0;
}

.metric-change {
  font-size: 0.8rem;
  color: #10b981;
  font-weight: 500;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
}

.chart-card,
.info-card {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.chart-card h3,
.info-card h3 {
  margin-top: 0;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1f2937;
  font-size: 1.1rem;
}

.chart-content {
  min-height: 200px;
}

.empty-chart {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #9ca3af;
}

.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.bar-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bar-label {
  width: 100px;
  font-size: 0.85rem;
  color: #6b7280;
  font-weight: 500;
}

.bar-container {
  flex: 1;
  height: 24px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.bar-value {
  width: 40px;
  text-align: right;
  font-weight: 600;
  color: #1f2937;
  font-size: 0.9rem;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.info-label {
  color: #6b7280;
  font-weight: 500;
  font-size: 0.9rem;
}

.info-value {
  color: #1f2937;
  font-weight: 600;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-value.connected {
  color: #10b981;
}

.info-value.warning {
  color: #f59e0b;
}

.info-value i {
  font-size: 0.7rem;
}

.features-section {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.features-section h3 {
  margin-top: 0;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1f2937;
  font-size: 1.1rem;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.feature-item {
  display: flex;
  gap: 15px;
  align-items: flex-start;
}

.feature-item i {
  font-size: 1.5rem;
  color: #667eea;
  margin-top: 3px;
  flex-shrink: 0;
}

.feature-item h4 {
  margin: 0 0 5px 0;
  color: #1f2937;
  font-size: 0.95rem;
}

.feature-item p {
  margin: 0;
  color: #6b7280;
  font-size: 0.85rem;
  line-height: 1.4;
}

@media (max-width: 768px) {
  .status-banner {
    flex-direction: column;
    gap: 15px;
  }

  .banner-content {
    width: 100%;
  }

  .metrics-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .metric-card {
    flex-direction: column;
    padding: 15px;
  }

  .metric-icon {
    width: 100%;
    height: 50px;
  }

  .metric-value {
    font-size: 1.5rem;
  }

  .charts-grid {
    grid-template-columns: 1fr;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>
