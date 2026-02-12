/**
 * StreamHealthMonitor
 * Monitors stream connectivity and health
 * Single Responsibility: Health monitoring only
 */

export class StreamHealthMonitor {
  constructor(config = {}) {
    this.apiService = config.apiService;
    this.checkInterval = config.checkInterval || 5000;
    this.isMonitoring = false;
    this.status = 'connecting';
    this.frameWidth = 640;
    this.frameHeight = 480;
    this.listeners = {};
    this.monitoringTimer = null;
  }

  start() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.checkHealth();
    this.monitoringTimer = setInterval(() => this.checkHealth(), this.checkInterval);
  }

  stop() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    this.isMonitoring = false;
  }

  async checkHealth() {
    try {
      const response = await this.apiService.getHealth();
      
      if (response && response.status === 'ok') {
        if (this.status !== 'connected') {
          this.status = 'connected';
          this.emit('statusChanged', { status: 'connected' });
        }

        if (response.frameWidth && response.frameHeight) {
          this.frameWidth = response.frameWidth;
          this.frameHeight = response.frameHeight;
        }
      } else {
        this.handleError();
      }
    } catch (error) {
      this.handleError();
    }
  }

  handleError() {
    if (this.status !== 'reconnecting') {
      this.status = 'reconnecting';
      this.emit('statusChanged', { status: 'reconnecting' });
    }
  }

  on(eventType, callback) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);
  }

  emit(eventType, data) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].forEach(callback => callback(data));
    }
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      streamStatus: this.status,
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight
    };
  }

  shutdown() {
    this.stop();
  }
}
