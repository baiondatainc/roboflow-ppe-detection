<script setup>
import { ref } from "vue";
import StreamViewer from "./components/StreamViewer.vue";
import WebcamViewer from "./components/WebcamViewer.vue";
import ViolationFeed from "./components/ViolationFeed.vue";
import Dashboard from "./components/Dashboard.vue";

const activeTab = ref("dashboard");
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <div class="header-content">
        <div class="logo-section">
          <i class="fas fa-shield-alt"></i>
          <h1>PPE Detection System</h1>
          <span class="subtitle">Powered by Roboflow</span>
        </div>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="app-nav">
      <button 
        :class="['nav-btn', { active: activeTab === 'dashboard' }]"
        @click="activeTab = 'dashboard'"
      >
        <i class="fas fa-chart-line"></i> Dashboard
      </button>
      <button 
        :class="['nav-btn', { active: activeTab === 'webcam' }]"
        @click="activeTab = 'webcam'"
      >
        <i class="fas fa-video"></i> Webcam
      </button>
      <button 
        :class="['nav-btn', { active: activeTab === 'stream' }]"
        @click="activeTab = 'stream'"
      >
        <i class="fas fa-film"></i> Live Stream
      </button>
      <button 
        :class="['nav-btn', { active: activeTab === 'alerts' }]"
        @click="activeTab = 'alerts'"
      >
        <i class="fas fa-bell"></i> Violations
      </button>
    </nav>

    <!-- Main Content -->
    <main class="app-main">
      <div v-show="activeTab === 'dashboard'" class="tab-content">
        <Dashboard />
      </div>
      <div v-show="activeTab === 'webcam'" class="tab-content">
        <WebcamViewer />
      </div>
      <div v-show="activeTab === 'stream'" class="tab-content">
        <StreamViewer />
      </div>
      <div v-show="activeTab === 'alerts'" class="tab-content">
        <ViolationFeed />
      </div>
    </main>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 40px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 15px;
}

.logo-section i {
  font-size: 2.5rem;
}

.logo-section h1 {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 0.9rem;
  opacity: 0.9;
  margin-left: auto;
  align-self: flex-end;
}

.app-nav {
  background: white;
  display: flex;
  gap: 10px;
  padding: 15px 40px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.nav-btn {
  padding: 10px 20px;
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.nav-btn:hover {
  border-color: #667eea;
  color: #667eea;
  transform: translateY(-2px);
}

.nav-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.app-main {
  flex: 1;
  overflow-y: auto;
  padding: 30px 40px;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}

.tab-content {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .app-header {
    padding: 15px 20px;
  }

  .logo-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .logo-section h1 {
    font-size: 1.5rem;
  }

  .subtitle {
    margin-left: 0;
    align-self: flex-start;
  }

  .app-nav {
    padding: 10px 20px;
    flex-wrap: wrap;
  }

  .app-main {
    padding: 15px 20px;
  }
}
</style>
