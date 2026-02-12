/**
 * VideoStreamProcessor
 * Manages video file streaming and processing
 * Single Responsibility: Video file processing
 */

import { spawn } from 'child_process';
import { FrameQueue } from './FrameQueue.js';
import fs from 'fs';

const MJPEG_START = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
const MJPEG_END = Buffer.from([0xFF, 0xD9]);

export class VideoStreamProcessor {
  constructor(config = {}) {
    this.config = {
      videoFile: config.videoFile || './ppe-upload-video-new1.mp4',
      fps: config.fps || 1,
      ...config
    };

    this.process = null;
    this.isProcessing = false;
    this.frameCount = 0;
    this.frameBuffer = Buffer.alloc(0);

    this.frameQueue = new FrameQueue({ maxQueueSize: config.maxQueueSize || 3 });
    this.onFrameProcessed = null;
  }

  /**
   * Check if video file exists
   */
  videoExists() {
    return fs.existsSync(this.config.videoFile);
  }

  /**
   * Start video processing
   */
  start() {
    if (this.isProcessing) {
      console.log('⚠️  Video already processing');
      return { success: false, message: 'Already processing' };
    }

    if (!this.videoExists()) {
      console.error(`❌ Video file not found: ${this.config.videoFile}`);
      return { success: false, error: 'Video file not found' };
    }

    this.isProcessing = true;
    this.frameCount = 0;
    this.frameQueue.clear();

    console.log('\n🎬 Starting video processing...');
    console.log(`📹 File: ${this.config.videoFile}`);

    this.spawnFFmpeg();
    return { success: true };
  }

  /**
   * Spawn FFmpeg process for video file
   */
  spawnFFmpeg() {
    this.process = spawn('ffmpeg', [
      '-i', this.config.videoFile,
      '-vf', `fps=${this.config.fps}`,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '2',
      '-'
    ]);

    let errorOccurred = false;
    let buffer = Buffer.alloc(0);

    this.process.stdout.on('data', async (chunk) => {
      if (errorOccurred) return;

      buffer = Buffer.concat([buffer, chunk]);

      let idx;
      while ((idx = buffer.indexOf(MJPEG_END)) !== -1) {
        const frameData = buffer.slice(0, idx + 2);
        buffer = buffer.slice(idx + 2);

        if (frameData.indexOf(MJPEG_START) !== -1) {
          this.frameCount++;

          this.frameQueue.enqueue({
            imageBuffer: frameData,
            frameNumber: this.frameCount,
            source: 'video'
          });
        }
      }
    });

    this.process.on('close', () => {
      console.log('✅ Video processing complete');
      this.stop();
    });

    this.process.on('error', (error) => {
      console.error('❌ FFmpeg error:', error.message);
      errorOccurred = true;
      this.stop();
    });
  }

  /**
   * Stop video processing
   */
  stop() {
    this.isProcessing = false;

    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch (e) {
        console.error('Error killing process:', e.message);
      }
      this.process = null;
    }

    this.frameQueue.clear();
    console.log('🎬 Video processing stopped');
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
