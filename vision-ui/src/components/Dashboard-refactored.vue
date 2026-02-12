<script setup>
import { ref, onMounted, computed } from "vue";
import { WebSocketService } from "../services/index.js";

const websocketService = new WebSocketService();

const violationStats = ref({
  total: 0,
  recentCount: 0,
  byType: {}
});

const connectionStatus = ref("connecting");
const lastUpdated = ref(new Date());
const isProcessing = ref(false);

const detectionMetrics = computed(() => ({
  totalViolations: violationStats.value.total,
  recentViolations: violationStats.value.recentCount,
  violationTypes: Object.keys(violationStats.value.byType).length
}));

onMounted(async () => {
  try {
    await websocketService.connect();
  } catch (error) {
    console.error("Failed to connect:", error);
  }

  websocketService.on('PPE_VIOLATION', (data) => {
    violationStats.value.total++;
    violationStats.value.recentCount++;

    const violationType = data.type || "Unknown";
    violationStats.value.byType[violationType] = 
      (violationStats.value.byType[violationType] || 0) + 1;

    lastUpdated.value = new Date();

    setTimeout(() => {
      violationStats.value.recentCount = 0;
    }, 60000);
  });

  websocketService.on('connected', () => {
    connectionStatus.value = "connected";
  });

  websocketService.on('disconnected', () => {
    connectionStatus.value = "disconnected";
  });

  checkProcessingStatus();
  setInterval(checkProcessingStatus, 2000);
});

const checkProcessingStatus = async () => {
  try {
    const response = await fetch("http://localhost:3001/api/status");
    if (response.ok) {
      const data = await response.json();
      isProcessing.value = data.isProcessingWebcam || data.isProcessingVideo || false;
    }
  } catch (error) {
    // Silently fail
  }
};

const resetStats = () => {
  violationStats.value = {
    total: 0,
    recentCount: 0,
    byType: {}
  };
};
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-header">
      <h1><i class="fas fa-chart-line"></i> PPE Detection Dashboard</h1>
      <div class="header-status">
        <span 
          class="connection-badge"
          :class="connectionStatus"
        >
          <i class="fas fa-circle"></i>
          {{ connectionStatus === 'connected' ? 'Connected' : 'Disconnected' }}
        </span>
        <span 
          class="processing-badge"
          :class="{ active: isProcessing }"
        >
          <i class="fas fa-spinner fa-spin" v-if="isProcessing"></i>
          {{ isProcessing ? 'Processing' : 'Idle' }}
        </span>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <div class="metric-content">
          <div class="metric-label">Total Violations</div>
          <div class="metric-value">{{ detectionMetrics.totalViolations }}</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <i class="fas fa-clock"></i>
        </div>
        <div class="metric-content">
          <div class="metric-label">Recent (1 min)</div>
          <div class="metric-value">{{ detectionMetrics.recentViolations }}</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <i class="fas fa-tags"></i>
        </div>
        <div class="metric-content">
          <div class="metric-label">Violation Types</div>
          <div class="metric-value">{{ detectionMetrics.violationTypes }}</div>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-icon">
          <i class="fas fa-sync"></i>
        </div>
        <div class="metric-content">
          <div class="metric-label">Last Updated</div>
          <div class="metric-value">{{ lastUpdated.toLocaleTimeString() }}</div>
        </div>
      </div>
    </div>

    <div class="violations-section">
      <div class="section-header">
        <h2><i class="fas fa-list"></i> Violations by Type</h2>
        <button @click="resetStats" class="reset-btn">
          <i class="fas fa-redo"></i> Reset
        </button>
      </div>

      <div v-if="Object.keys(violationStats.byType).length === 0" class="no-data">
        <i class="fas fa-inbox"></i>
        <p>No violations recorded yet</p>
      </div>

      <div v-else class="violations-list">
        <div 
          v-for="(count, type) in violationStats.byType"
          :key="type"
          class="violation-item"
        >
          <div class="violation-type">{{ type }}</div>
          <div class="violation-count">
            <span class="count-badge">{{ count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  min-height: 100vh;
  padding: 30px;
}

.dashboard-header {
  background: white;
  border-radius: 12px;
  padding: 30px;
  margin-bottom: 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.dashboard-header h1 {
  margin: 0;
  font-size: 2rem;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 15px;
}

.header-status {
  display: flex;
  gap: 15px;
}

.connection-badge,
.processing-badge {
  padding: 10px 16px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.connection-badge.connected {
  background: #d1fae5;
  color: #065f46;
}

.connection-badge.disconnected {
  background: #fee2e2;
  color: #991b1b;
}

.processing-badge {
  background: #fef3c7;
  color: #92400e;
}

.processing-badge.active {
  background: #d1fae5;
  color: #065f46;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.metric-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  gap: 15px;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
}

.metric-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
}

.metric-icon {
  font-size: 2rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  color: #0284c7;
  border-radius: 10px;
}

.metric-content {
  flex: 1;
}

.metric-label {
  font-size: 0.85rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.metric-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #1f2937;
}

.violations-section {
  background: white;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e5e7eb;
}

.section-header h2 {
  margin: 0;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 10px;
}

.reset-btn {
  padding: 10px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.3s;
}

.reset-btn:hover {
  background: #2563eb;
}

.no-data {
  text-align: center;
  padding: 40px 20px;
  color: #9ca3af;
}

.no-data i {
  font-size: 3rem;
  margin-bottom: 15px;
  opacity: 0.5;
}

.violations-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.violation-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: #f9fafb;
  border-radius: 8px;
  border-left: 4px solid #3b82f6;
}

.violation-type {
  font-weight: 600;
  color: #1f2937;
  text-transform: capitalize;
}

.count-badge {
  background: #3b82f6;
  color: white;
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.9rem;
}
</style>
