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
          <img src="/logo.jpeg" alt="Sutherland Logo" class="sutherland-logo">
          <div class="header-text">
            <h1>PPE Detection System</h1>
            <span class="subtitle">Powered by Sutherland</span>
          </div>
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
  background: #FFFFFF;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.app-header {
  background: linear-gradient(135deg, #27235C 0%, #1a1640 100%);
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
  gap: 20px;
}

.sutherland-logo {
  height: 60px;
  width: auto;
  min-width: 60px;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.header-text h1 {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin: 0;
}

.subtitle {
  font-size: 0.9rem;
  opacity: 0.9;
  margin: 0;
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
  border-color: #DE1B54;
  color: #DE1B54;
  transform: translateY(-2px);
}

.nav-btn.active {
  background: linear-gradient(135deg, #DE1B54 0%, #B31545 100%);
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
