/**
 * FPSCounter
 * Tracks frame rate performance
 * Single Responsibility: FPS calculation only
 */

export class FPSCounter {
  constructor(config = {}) {
    this.sampleSize = config.sampleSize || 30;
    this.timestamps = [];
    this.currentFPS = 0;
  }

  record(timestamp = performance.now()) {
    this.timestamps.push(timestamp);

    if (this.timestamps.length > this.sampleSize) {
      this.timestamps.shift();
    }

    this.calculateFPS();
  }

  calculateFPS() {
    if (this.timestamps.length < 2) {
      this.currentFPS = 0;
      return;
    }

    const timeDiff = this.timestamps[this.timestamps.length - 1] - this.timestamps[0];
    if (timeDiff > 0) {
      this.currentFPS = (this.timestamps.length - 1) / (timeDiff / 1000);
    }
  }

  getFPS() {
    return this.currentFPS;
  }

  reset() {
    this.timestamps = [];
    this.currentFPS = 0;
  }

  getStatus() {
    return {
      currentFPS: this.currentFPS,
      sampledFrames: this.timestamps.length,
      sampleSize: this.sampleSize
    };
  }
}
