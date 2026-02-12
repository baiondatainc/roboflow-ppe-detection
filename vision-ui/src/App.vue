<script setup>
import { ref } from "vue";
import Dashboard from "./components/Dashboard.vue";
import WebcamViewer from "./components/WebcamViewer.vue";
import StreamViewer from "./components/StreamViewer.vue";

const activeTab = ref("dashboard");
</script>

<template>
  <div class="app-container">
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
        <i class="fas fa-film"></i> Video Stream
      </button>
    </nav>

    <main class="app-content">
      <keep-alive>
        <Dashboard v-if="activeTab === 'dashboard'" />
        <WebcamViewer v-else-if="activeTab === 'webcam'" />
        <StreamViewer v-else-if="activeTab === 'stream'" />
      </keep-alive>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f3f4f6;
}

.app-header {
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
  color: white;
  padding: 20px 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 20px;
}

.sutherland-logo {
  height: 50px;
  width: auto;
  filter: brightness(0) invert(1);
}

.header-text {
  display: flex;
  flex-direction: column;
}

.header-text h1 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
}

.subtitle {
  font-size: 0.85rem;
  opacity: 0.9;
  margin-top: 4px;
}

.app-nav {
  background: white;
  border-bottom: 2px solid #e5e7eb;
  padding: 0;
  display: flex;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.nav-btn {
  flex: 1;
  padding: 16px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s;
  border-bottom: 3px solid transparent;
}

.nav-btn:hover {
  background: #f9fafb;
  color: #1f2937;
}

.nav-btn.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.app-content {
  flex: 1;
  padding: 30px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .app-nav {
    flex-wrap: wrap;
  }

  .nav-btn {
    flex: 0 0 50%;
    border-bottom: 2px solid #e5e7eb;
  }

  .nav-btn.active {
    border-bottom-color: #3b82f6;
  }

  .header-text h1 {
    font-size: 1.4rem;
  }

  .app-content {
    padding: 20px;
  }
}
</style>
