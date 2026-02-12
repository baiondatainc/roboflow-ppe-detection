/**
 * FrameQueue
 * Manages frame processing queue
 * Single Responsibility: Frame queueing and processing
 */

export class FrameQueue {
  constructor(config = {}) {
    this.queue = [];
    this.isProcessing = false;
    this.maxQueueSize = config.maxQueueSize || 3;
    this.onProcess = null; // Callback for processing
  }

  /**
   * Add frame to queue
   * @param {Object} frame - Frame data {imageBuffer, frameNumber, source}
   * @returns {boolean} True if queued, false if queue full
   */
  enqueue(frame) {
    if (this.queue.length >= this.maxQueueSize) {
      console.log(`⚠️  Queue full, skipping frame #${frame.frameNumber}`);
      return false;
    }

    this.queue.push(frame);

    if (!this.isProcessing && this.onProcess) {
      this.processNext();
    }

    return true;
  }

  /**
   * Process next frame in queue
   */
  async processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const frame = this.queue.shift();

    try {
      if (this.onProcess) {
        await this.onProcess(frame);
      }
    } catch (error) {
      console.error(`❌ Frame processing error:`, error.message);
    }

    setImmediate(() => this.processNext());
  }

  /**
   * Set processing callback
   * @param {Function} callback - Async function to process frame
   */
  setProcessor(callback) {
    this.onProcess = callback;
  }

  /**
   * Clear queue
   */
  clear() {
    this.queue = [];
    this.isProcessing = false;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      maxSize: this.maxQueueSize,
      isProcessing: this.isProcessing,
      isFull: this.queue.length >= this.maxQueueSize
    };
  }
}
