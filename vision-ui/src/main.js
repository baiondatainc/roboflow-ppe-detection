import { createApp } from 'vue'
import App from './App-refactored.vue'
import './styles/global.css'

const app = createApp(App)

// Global Styles
app.config.globalProperties.$styles = {
  primary: '#667eea',
  secondary: '#764ba2',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
}

app.mount('#app')
