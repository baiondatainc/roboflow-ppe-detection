/**
 * WebSocketBroadcaster
 * Manages WebSocket connections and broadcasting
 * Single Responsibility: WebSocket communication
 */

import { WebSocketServer } from 'ws';

export class WebSocketBroadcaster {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Set();

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`✅ WebSocket client connected. Total: ${this.clients.size}`);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`❌ WebSocket client disconnected. Total: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error(`⚠️  WebSocket error: ${error.message}`);
      });
    });
  }

  /**
   * Broadcast message to all connected clients
   * @param {Object} data - Data to broadcast
   */
  broadcast(data) {
    const message = JSON.stringify(data);
    const deadClients = [];

    this.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('❌ Broadcast error:', error.message);
          deadClients.push(ws);
        }
      }
    });

    // Remove dead connections
    deadClients.forEach((ws) => this.clients.delete(ws));
  }

  /**
   * Broadcast detection event
   * @param {Object} detection - Detection data
   */
  broadcastDetection(detection) {
    this.broadcast({
      eventType: 'PPE_DETECTION_BATCH_WEBCAM',
      ...detection
    });
  }

  /**
   * Broadcast error event
   * @param {string} error - Error message
   * @param {string} message - Error details
   */
  broadcastError(error, message) {
    this.broadcast({
      eventType: 'WEBCAM_ERROR',
      error,
      message
    });
  }

  /**
   * Get broadcaster status
   */
  getStatus() {
    return {
      connectedClients: this.clients.size
    };
  }

  /**
   * Shutdown broadcaster
   */
  shutdown() {
    this.clients.forEach((ws) => ws.close());
    this.clients.clear();
  }
}
