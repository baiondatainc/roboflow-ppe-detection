<script setup>
import { ref, onMounted, computed } from "vue";
import { WebSocketService } from "../services/index.js";

const websocketService = new WebSocketService();

const violationStats = ref({
  total: 0,
  recentCount: 0,
  byType: {},
  byLocation: {}
});

const connectionStatus = ref("connecting");
const lastUpdated = ref(new Date());
const isProcessing = ref(false);
const selectedMonth = ref(new Date().toLocaleString('default', { month: 'long' }));

const detectionMetrics = computed(() => ({
  totalViolations: violationStats.value.total,
  openViolations: Math.max(0, Math.floor(violationStats.value.total * 0.7)),
  inProgressViolations: Math.max(0, Math.floor(violationStats.value.total * 0.2)),
  closedViolations: Math.max(0, violationStats.value.total - Math.floor(violationStats.value.total * 0.7) - Math.floor(violationStats.value.total * 0.2)),
  recentViolations: violationStats.value.recentCount,
  violationTypes: Object.keys(violationStats.value.byType).length,
  complianceRate: 100 - (violationStats.value.total > 0 ? Math.min(100, violationStats.value.total * 5) : 0)
}));

const topViolationTypes = computed(() => {
  return Object.entries(violationStats.value.byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));
});

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

    const location = data.location || "Unknown";
    violationStats.value.byLocation[location] = 
      (violationStats.value.byLocation[location] || 0) + 1;

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
    byType: {},
    byLocation: {}
  };
};

const getViolationColor = (type) => {
  const colors = {
    'no_hardhat': '#ef4444',
    'no_gloves': '#f97316',
    'no_vest': '#eab308',
    'no_safety_vest': '#eab308',
    'hardhat': '#10b981',
    'gloves': '#3b82f6',
    'vest': '#8b5cf6'
  };
  return colors[type.toLowerCase()] || '#6b7280';
};
</script>

<template>
  <div class="dashboard">
    <!-- Header -->
    <div class="dashboard-header">
      <div class="header-left">
        <h1><i class="fas fa-shield-alt"></i> PPE Detection Audit Dashboard</h1>
        <p class="header-subtitle">Real-time safety compliance tracking and violation management</p>
      </div>
      <div class="header-right">
        <div class="status-group">
          <span 
            class="status-badge"
            :class="connectionStatus"
          >
            <i class="fas fa-circle"></i>
            {{ connectionStatus === 'connected' ? 'Connected' : 'Disconnected' }}
          </span>
          <span 
            class="status-badge"
            :class="{ processing: isProcessing, idle: !isProcessing }"
          >
            <i class="fas fa-spinner fa-spin" v-if="isProcessing"></i>
            {{ isProcessing ? 'Processing' : 'Idle' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Top Metrics -->
    <div class="top-metrics">
      <div class="metric-box total">
        <div class="metric-label">TOTAL VIOLATIONS</div>
        <div class="metric-value">{{ detectionMetrics.totalViolations }}</div>
      </div>
      <div class="metric-box open">
        <div class="metric-label">OPEN</div>
        <div class="metric-value">{{ detectionMetrics.openViolations }}</div>
      </div>
      <div class="metric-box in-progress">
        <div class="metric-label">IN PROGRESS</div>
        <div class="metric-value">{{ detectionMetrics.inProgressViolations }}</div>
      </div>
      <div class="metric-box closed">
        <div class="metric-label">CLOSED</div>
        <div class="metric-value">{{ detectionMetrics.closedViolations }}</div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-section">
      <!-- Left Column -->
      <div class="chart-column left">
        <div class="chart-card">
          <h3>Violation Categories</h3>
          <div class="simple-chart">
            <div class="chart-bar" v-for="(type, count) in topViolationTypes.slice(0, 3)" :key="type.type">
              <div class="bar-label">{{ type.type.replace(/_/g, ' ') }}</div>
              <div class="bar-container">
                <div class="bar-fill" :style="{ width: (type.count / Math.max(...topViolationTypes.map(t => t.count))) * 100 + '%', backgroundColor: getViolationColor(type.type) }"></div>
              </div>
              <div class="bar-value">{{ type.count }}</div>
            </div>
          </div>
        </div>

        <div class="chart-card">
          <h3>Status Summary</h3>
          <div class="status-list">
            <div class="status-row">
              <span class="status-name">Open</span>
              <span class="status-count">{{ detectionMetrics.openViolations }}</span>
            </div>
            <div class="status-row">
              <span class="status-name">In Progress</span>
              <span class="status-count">{{ detectionMetrics.inProgressViolations }}</span>
            </div>
            <div class="status-row">
              <span class="status-name">Closed</span>
              <span class="status-count">{{ detectionMetrics.closedViolations }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Center Column -->
      <div class="chart-column center">
        <div class="chart-card full-height">
          <h3>Compliance Distribution</h3>
          <div class="pie-chart">
            <div class="pie-placeholder">
              <div class="pie-text">{{ detectionMetrics.complianceRate.toFixed(0) }}% Compliant</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div class="chart-column right">
        <div class="chart-card">
          <h3>Departments</h3>
          <div class="dept-chart">
            <div class="dept-bar" v-for="(count, dept, idx) in violationStats.byLocation" :key="dept">
              <div class="dept-label">{{ dept }}</div>
              <div class="dept-bar-container">
                <div class="dept-bar-fill" :style="{ width: (count / Math.max(...Object.values(violationStats.byLocation) || [1])) * 100 + '%' }"></div>
              </div>
              <div class="dept-count">{{ count }}</div>
            </div>
          </div>
        </div>

        <div class="info-card">
          <div class="info-item">
            <label>Year</label>
            <span>2024</span>
          </div>
          <div class="info-item">
            <label>Compliance Rate</label>
            <span class="compliance-percentage">{{ detectionMetrics.complianceRate.toFixed(0) }}%</span>
          </div>
          <div class="info-item">
            <label>Last Updated</label>
            <span class="timestamp">{{ lastUpdated.toLocaleTimeString() }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Monthly Details -->
    <div class="monthly-section">
      <div class="month-selector">
        <label>Select Month</label>
        <select v-model="selectedMonth" class="month-dropdown">
          <option>January</option>
          <option>February</option>
          <option>March</option>
          <option>April</option>
          <option>May</option>
          <option>June</option>
          <option>July</option>
          <option>August</option>
          <option>September</option>
          <option>October</option>
          <option>November</option>
          <option>December</option>
        </select>
      </div>

      <div class="violations-detail">
        <div class="detail-box">
          <label>No. of Audits</label>
          <div class="detail-value">{{ violationStats.total }}</div>
        </div>

        <div class="violations-table">
          <h3>All Violations</h3>
          <div v-if="topViolationTypes.length === 0" class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>No violations recorded yet</p>
          </div>
          <div v-else class="violation-rows">
            <div v-for="violation in topViolationTypes" :key="violation.type" class="violation-row">
              <span class="violation-type">{{ violation.type.replace(/_/g, ' ') }}</span>
              <span class="violation-badge" :style="{ backgroundColor: getViolationColor(violation.type) }">
                {{ violation.count }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="dashboard-footer">
      <button @click="resetStats" class="reset-button">
        <i class="fas fa-redo"></i> Reset Statistics
      </button>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  min-height: 100vh;
  padding: 25px;
}

.dashboard-header {
  background: white;
  border-radius: 8px;
  padding: 25px;
  margin-bottom: 25px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border-top: 4px solid #059669;
}

.header-left h1 {
  margin: 0 0 8px 0;
  font-size: 1.8rem;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-subtitle {
  margin: 0;
  color: #6b7280;
  font-size: 0.9rem;
}

.header-right {
  display: flex;
  gap: 15px;
}

.status-group {
  display: flex;
  gap: 10px;
}

.status-badge {
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.status-badge.connected {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.disconnected {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.processing {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.idle {
  background: #fef3c7;
  color: #92400e;
}

/* Top Metrics */
.top-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 25px;
}

.metric-box {
  background: white;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border-top: 4px solid #6b7280;
}

.metric-box.total {
  border-top-color: #1f2937;
}

.metric-box.open {
  border-top-color: #f59e0b;
}

.metric-box.in-progress {
  border-top-color: #06b6d4;
}

.metric-box.closed {
  border-top-color: #10b981;
}

.metric-label {
  font-size: 0.8rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  font-weight: 600;
}

.metric-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #1f2937;
}

/* Charts Section */
.charts-section {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
  margin-bottom: 25px;
}

.chart-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chart-column.left {
  grid-column: 1;
}

.chart-column.center {
  grid-column: 2;
}

.chart-column.right {
  grid-column: 3;
}

.chart-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.chart-card.full-height {
  min-height: 320px;
}

.chart-card h3 {
  margin: 0 0 15px 0;
  font-size: 1rem;
  color: #1f2937;
  font-weight: 600;
}

.simple-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-label {
  min-width: 120px;
  font-size: 0.85rem;
  color: #6b7280;
  text-transform: capitalize;
}

.bar-container {
  flex: 1;
  height: 24px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
  opacity: 0.85;
}

.bar-value {
  min-width: 30px;
  text-align: right;
  font-weight: 600;
  color: #1f2937;
  font-size: 0.9rem;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
}

.status-name {
  font-weight: 500;
  color: #6b7280;
}

.status-count {
  font-weight: 700;
  font-size: 1.2rem;
  color: #1f2937;
}

.pie-chart {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 250px;
}

.pie-placeholder {
  width: 180px;
  height: 180px;
  background: conic-gradient(from 0deg, #10b981 0deg 216deg, #fbbf24 216deg 270deg, #ef4444 270deg 360deg);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 30px white;
  position: relative;
}

.pie-text {
  font-weight: 700;
  font-size: 1.1rem;
  color: #1f2937;
}

.dept-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dept-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dept-label {
  min-width: 90px;
  font-size: 0.8rem;
  color: #6b7280;
}

.dept-bar-container {
  flex: 1;
  height: 20px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.dept-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  border-radius: 3px;
}

.dept-count {
  min-width: 25px;
  text-align: right;
  font-weight: 600;
  color: #1f2937;
  font-size: 0.85rem;
}

.info-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #e5e7eb;
}

.info-item:last-child {
  border-bottom: none;
}

.info-item label {
  font-size: 0.8rem;
  color: #6b7280;
  font-weight: 600;
  text-transform: uppercase;
}

.info-item span {
  font-weight: 600;
  color: #1f2937;
}

.compliance-percentage {
  color: #10b981;
  font-size: 1.1rem;
}

.timestamp {
  font-size: 0.85rem;
  color: #6b7280;
}

/* Monthly Section */
.monthly-section {
  background: white;
  border-radius: 8px;
  padding: 25px;
  margin-bottom: 25px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 30px;
}

.month-selector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.month-selector label {
  font-weight: 600;
  color: #6b7280;
  font-size: 0.85rem;
  text-transform: uppercase;
}

.month-dropdown {
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #1f2937;
  cursor: pointer;
  background: white;
}

.month-dropdown:hover {
  border-color: #059669;
}

.violations-detail {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 20px;
}

.detail-box {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
}

.detail-box label {
  display: block;
  font-size: 0.8rem;
  color: #065f46;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 8px;
}

.detail-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #047857;
}

.violations-table {
  background: #f9fafb;
  border-radius: 8px;
  padding: 15px;
}

.violations-table h3 {
  margin: 0 0 15px 0;
  font-size: 0.95rem;
  color: #1f2937;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: #9ca3af;
}

.empty-state i {
  font-size: 2rem;
  margin-bottom: 10px;
  opacity: 0.5;
  display: block;
}

.violation-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.violation-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border-left: 4px solid #e5e7eb;
}

.violation-type {
  font-weight: 500;
  color: #1f2937;
  text-transform: capitalize;
}

.violation-badge {
  color: white;
  padding: 6px 14px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 0.85rem;
}

/* Footer */
.dashboard-footer {
  display: flex;
  justify-content: center;
  gap: 15px;
}

.reset-button {
  padding: 12px 24px;
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(5, 150, 105, 0.3);
}

.reset-button:hover {
  background: linear-gradient(135deg, #047857 0%, #036d4a 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.4);
}

/* Responsive */
@media (max-width: 1400px) {
  .charts-section {
    grid-template-columns: 1fr 1fr;
  }

  .chart-column.right {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .dashboard-header {
    flex-direction: column;
    gap: 15px;
  }

  .header-right {
    flex-direction: column;
    width: 100%;
  }

  .status-group {
    width: 100%;
  }

  .charts-section {
    grid-template-columns: 1fr;
  }

  .chart-column {
    grid-column: auto !important;
  }

  .monthly-section {
    grid-template-columns: 1fr;
  }

  .top-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
