/**
 * WebSocketService
 * Handles WebSocket connection and event management
 * Single Responsibility: WebSocket communication only
 */

export class WebSocketService {
  constructor(config = {}) {
    this.url = config.url || "ws://localhost:3001";
    this.socket = null;
    this.listeners = {};
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.addEventListener("open", () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log("✅ WebSocket connected");
          this.emit("connected");
          resolve();
        });

        this.socket.addEventListener("close", () => {
          this.isConnected = false;
          console.log("❌ WebSocket disconnected");
          this.emit("disconnected");
          this.attemptReconnect();
        });

        this.socket.addEventListener("error", (error) => {
          console.error("❌ WebSocket error:", error);
          this.emit("error", error);
          reject(error);
        });

        this.socket.addEventListener("message", (event) => {
          this.handleMessage(event.data);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      const eventType = message.eventType;
      if (eventType && this.listeners[eventType]) {
        this.listeners[eventType].forEach(callback => callback(message));
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  }

  on(eventType, callback) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);
    return () => {
      this.listeners[eventType] = this.listeners[eventType].filter(cb => cb !== callback);
    };
  }

  emit(eventType, data) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].forEach(callback => callback(data));
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => this.connect().catch(() => {}), this.reconnectDelay);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      url: this.url,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
