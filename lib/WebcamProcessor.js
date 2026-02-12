/**
 * WebcamProcessor
 * Manages webcam stream processing
 * Single Responsibility: Webcam capture and frame processing
 */

import { spawn } from 'child_process';
import { FrameQueue } from './FrameQueue.js';

const MJPEG_START = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
const MJPEG_END = Buffer.from([0xFF, 0xD9]);
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB max buffer

export class WebcamProcessor {
  constructor(config = {}) {
    this.config = {
      device: config.device || '/dev/video0',
      videoSize: config.videoSize || '640x480',
      framerate: config.framerate || 30,
      outputFps: config.outputFps || 10,
      ...config
    };

    this.process = null;
    this.isProcessing = false;
    this.frameCount = 0;
    this.frameBuffer = Buffer.alloc(0);
    this.frameWidth = 640;
    this.frameHeight = 480;
    this.lastFrameTime = Date.now();
    this.healthCheckInterval = null;

    this.frameQueue = new FrameQueue({ maxQueueSize: config.maxQueueSize || 3 });
    this.onFrameProcessed = null; // Callback when frame is processed
  }

  /**
   * Start webcam processing
   */
  start() {
    if (this.isProcessing) {
      console.log('⚠️  Webcam already processing');
      return { success: true, message: 'Already processing' };
    }

    this.isProcessing = true;
    this.frameCount = 0;
    this.frameQueue.clear();
    this.lastFrameTime = Date.now();

    console.log('\n🎥 Starting webcam PPE detection...');
    console.log(`⚙️  Device: ${this.config.device}`);

    this.startHealthMonitoring();
    this.spawnFFmpeg();

    return { success: true, message: 'Webcam started' };
  }

  /**
   * Spawn FFmpeg process
   */
  spawnFFmpeg() {
    this.process = spawn('ffmpeg', [
      '-f', 'v4l2',
      '-input_format', 'yuyv422',
      '-video_size', this.config.videoSize,
      '-framerate', String(this.config.framerate),
      '-i', this.config.device,
      '-vf', `fps=${this.config.outputFps}`,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '2',
      'pipe:1'
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let errorOccurred = false;

    this.process.stdout.on('data', async (chunk) => {
      if (errorOccurred) return;

      this.frameBuffer = Buffer.concat([this.frameBuffer, chunk]);

      // Prevent buffer overflow
      if (this.frameBuffer.length > MAX_BUFFER_SIZE) {
        console.warn(`⚠️  Buffer overflow: ${this.frameBuffer.length} bytes, resetting`);
        this.frameBuffer = Buffer.alloc(0);
        return;
      }

      let idx;
      while ((idx = this.frameBuffer.indexOf(MJPEG_END)) !== -1) {
        const frameData = this.frameBuffer.slice(0, idx + 2);
        this.frameBuffer = this.frameBuffer.slice(idx + 2);

        if (frameData.indexOf(MJPEG_START) !== -1) {
          this.frameCount++;
          this.lastFrameTime = Date.now();

          // Process the frame - this will broadcast MJPEG to /webcam clients
          // and also send to detection service
          this.frameQueue.enqueue({
            imageBuffer: frameData,
            jpegBuffer: frameData, // Pass JPEG buffer for streaming
            frameNumber: this.frameCount,
            source: 'webcam'
          });
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      const message = data.toString().trim();

      // Check for critical errors
      if (message.includes('Device or resource busy')) {
        errorOccurred = true;
        console.error('❌ Webcam device is busy. Kill other processes using camera');
        this.stop();
        return;
      }

      if (message.includes('Invalid argument') || message.includes('Error while')) {
        console.error('❌ FFmpeg parameter error:', message.substring(0, 200));
        errorOccurred = true;
        this.stop();
        return;
      }

      // Ignore common info messages
      if (message.includes('frame=') || message.includes('fps=') ||
          message.includes('Stream') || message.includes('Duration')) {
        return;
      }

      if (message.toLowerCase().includes('error')) {
        console.error('❌ FFmpeg:', message.substring(0, 200));
      }
    });

    this.process.on('close', (code) => {
      console.log(`🎥 Webcam process closed with code ${code}`);
      this.stop();
    });

    this.process.on('error', (error) => {
      console.error('❌ FFmpeg spawn error:', error.message);
      errorOccurred = true;
      this.stop();
    });
  }

  /**
   * Stop webcam processing
   */
  stop() {
    this.isProcessing = false;
    this.stopHealthMonitoring();

    if (this.process) {
      try {
        this.process.kill('SIGTERM');
        setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
        }, 2000);
      } catch (e) {
        console.error('Error killing webcam process:', e.message);
      }
      this.process = null;
    }

    this.frameQueue.clear();
    console.log('🎥 Webcam processing stopped');
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      const timeSinceLastFrame = Date.now() - this.lastFrameTime;
      if (timeSinceLastFrame > 60000) {
        console.warn('⚠️  No frames received in 60 seconds');
      }
    }, 10000);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Set frame processor callback
   * @param {Function} callback - Async function to process frame
   */
  setFrameProcessor(callback) {
    this.frameQueue.setProcessor(callback);
    this.onFrameProcessed = callback;
  }

  /**
   * Get processor status
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      frameCount: this.frameCount,
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight,
      lastFrameAge: Date.now() - this.lastFrameTime,
      queueStatus: this.frameQueue.getStatus()
    };
  }

  /**
   * Shutdown processor
   */
  shutdown() {
    this.stop();
  }
}
