/**
 * APIService
 * Handles HTTP API calls to backend
 * Single Responsibility: API communication only
 */

export class APIService {
  constructor(config = {}) {
    this.baseURL = config.baseURL || "http://localhost:3001";
    this.timeout = config.timeout || 5000;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getHealth() {
    return this.request('/health');
  }

  async getStatus() {
    return this.request('/api/status');
  }

  async startWebcamProcessing() {
    return this.request('/api/start-webcam-processing', { method: 'POST' });
  }

  async stopWebcamProcessing() {
    return this.request('/api/stop-webcam-processing', { method: 'POST' });
  }

  async startVideoProcessing(videoFile) {
    return this.request('/api/start-processing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoFile })
    });
  }

  async stopVideoProcessing() {
    return this.request('/api/stop-processing', { method: 'POST' });
  }

  getWebcamStreamUrl() {
    return `${this.baseURL}/webcam`;
  }

  getVideoStreamUrl() {
    return `${this.baseURL}/video`;
  }

  getStatus() {
    return {
      baseURL: this.baseURL,
      timeout: this.timeout
    };
  }
}
