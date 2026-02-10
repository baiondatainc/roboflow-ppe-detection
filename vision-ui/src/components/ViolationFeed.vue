<script setup>
import { ref, onMounted, computed } from "vue";
import socket from "../services/socket";

const alerts = ref([]);
const sortBy = ref("timestamp"); // 'timestamp' or 'severity'

const sortedAlerts = computed(() => {
  return [...alerts.value].sort((a, b) => {
    if (sortBy.value === "timestamp") {
      return new Date(b.timestamp) - new Date(a.timestamp);
    }
    return 0;
  });
});

const stats = computed(() => ({
  total: alerts.value.length,
  recentCount: alerts.value.filter(a => {
    const timeDiff = Date.now() - new Date(a.timestamp);
    return timeDiff < 60000; // Last minute
  }).length
}));

onMounted(() => {
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.eventType === "PPE_VIOLATION") {
      alerts.value.unshift(data);
      // Keep only last 100 alerts
      if (alerts.value.length > 100) {
        alerts.value.pop();
      }
    }
  });
});

const clearAlerts = () => {
  alerts.value = [];
};

const getMissingItems = (data) => {
  // Handle different data structures
  if (data.missing && Array.isArray(data.missing)) {
    return data.missing.join(", ");
  }
  if (data.type) {
    return data.type;
  }
  if (data.label) {
    return data.label;
  }
  return "Unknown";
};

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString();
};

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleDateString();
};
</script>

<template>
  <div class="violations-container">
    <div class="violations-header">
      <h2><i class="fas fa-exclamation-triangle"></i> PPE Violations Feed</h2>
      <div class="header-actions">
        <select v-model="sortBy" class="sort-select">
          <option value="timestamp">Sort by Time</option>
        </select>
        <button @click="clearAlerts" class="clear-btn" v-if="alerts.length > 0">
          <i class="fas fa-trash"></i> Clear
        </button>
      </div>
    </div>

    <div class="violations-stats">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">Total Violations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.recentCount }}</div>
        <div class="stat-label">Last 60s</div>
      </div>
    </div>

    <div class="violations-feed">
      <div v-if="alerts.length === 0" class="empty-state">
        <i class="fas fa-check-circle"></i>
        <p>No PPE violations detected</p>
        <small>All personnel are compliant</small>
      </div>
      
      <transition-group name="list" v-else>
        <div 
          v-for="(alert, index) in sortedAlerts" 
          :key="alert.id || index"
          class="violation-card"
        >
          <div class="violation-header">
            <div class="violation-id">
              <i class="fas fa-user"></i>
              <span class="person-id">{{ alert.personId || 'Unknown Person' }}</span>
            </div>
            <div class="violation-time">
              {{ formatTime(alert.timestamp) }}
            </div>
          </div>
          
          <div class="violation-body">
            <div class="violation-detail">
              <i class="fas fa-shield-alt"></i>
              <div>
                <strong>Violation:</strong>
                <span class="missing-items">{{ getMissingItems(alert) }}</span>
              </div>
            </div>
            
            <div v-if="alert.confidence" class="violation-detail">
              <i class="fas fa-chart-line"></i>
              <div>
                <strong>Confidence:</strong>
                <span>{{ (alert.confidence * 100).toFixed(1) }}%</span>
              </div>
            </div>

            <div v-if="alert.entity?.location" class="violation-detail">
              <i class="fas fa-map-marker-alt"></i>
              <div>
                <strong>Location:</strong>
                <span>{{ alert.entity.location }}</span>
              </div>
            </div>
          </div>

          <div class="violation-footer">
            <span class="date-badge">{{ formatDate(alert.timestamp) }}</span>
            <span class="status-badge status-alert">Active</span>
          </div>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<style scoped>
.violations-container {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.violations-header {
  background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%);
  color: white;
  padding: 25px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.violations-header h2 {
  font-size: 1.8rem;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.sort-select {
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  font-size: 0.9rem;
}

.sort-select option {
  background: #333;
  color: white;
}

.clear-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.clear-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.violations-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  padding: 20px 25px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.stat-card {
  background: white;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
  border: 1px solid #e5e7eb;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #f5576c;
}

.stat-label {
  font-size: 0.85rem;
  color: #6b7280;
  margin-top: 5px;
}

.violations-feed {
  padding: 20px 25px;
  max-height: 600px;
  overflow-y: auto;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
}

.empty-state i {
  font-size: 3rem;
  color: #d1d5db;
  margin-bottom: 15px;
  display: block;
}

.empty-state p {
  font-size: 1.1rem;
  font-weight: 500;
  margin: 10px 0;
}

.empty-state small {
  color: #d1d5db;
}

.violation-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 12px;
  transition: all 0.3s ease;
}

.violation-card:hover {
  border-color: #f5576c;
  box-shadow: 0 2px 8px rgba(245, 87, 108, 0.15);
}

.violation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}

.violation-id {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1f2937;
}

.violation-id i {
  color: #f5576c;
  font-size: 1.2rem;
}

.person-id {
  font-size: 1rem;
}

.violation-time {
  font-size: 0.85rem;
  color: #6b7280;
  background: white;
  padding: 4px 8px;
  border-radius: 4px;
}

.violation-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.violation-detail {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.9rem;
}

.violation-detail i {
  color: #f5576c;
  margin-top: 2px;
  min-width: 20px;
}

.missing-items {
  color: #dc2626;
  font-weight: 500;
  display: block;
  margin-top: 3px;
}

.violation-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.date-badge {
  background: #e5e7eb;
  color: #6b7280;
  padding: 4px 8px;
  border-radius: 4px;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.status-alert {
  background: #fee2e2;
  color: #991b1b;
}

.list-enter-active, .list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

@media (max-width: 768px) {
  .violations-header {
    flex-direction: column;
    gap: 15px;
  }

  .violations-header h2 {
    font-size: 1.3rem;
  }

  .header-actions {
    width: 100%;
  }

  .violations-feed {
    max-height: none;
  }
}
</style>
