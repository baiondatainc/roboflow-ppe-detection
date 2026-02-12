/**
 * PythonInferenceService
 * Manages communication with Python inference service
 * Single Responsibility: Handle Python process lifecycle and inference calls
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PythonInferenceService {
  constructor(config = {}) {
    this.process = null;
    this.ready = false;
    this.config = {
      confidence: config.confidence || 0.55,
      ...config
    };
  }

  /**
   * Initialize Python inference service
   */
  initialize() {
    console.log('\n🐍 Starting Python inference service...');
    
    try {
      // Use system python3 directly instead of venv
      const pythonExecutable = 'python3';
      this.process = spawn(pythonExecutable, ['inference_service.py'], {
        cwd: path.dirname(__dirname), // Go up one level to project root
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.on('error', (error) => {
        console.error('❌ Python process error:', error.message);
        this.ready = false;
      });

      this.process.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (message.includes('✓') || message.includes('INFO')) {
          console.log(`🐍 ${message}`);
          if (message.includes('Ready')) {
            this.ready = true;
          }
        } else if (message.includes('ERROR')) {
          console.error(`🐍 ${message}`);
        }
      });

      this.process.on('close', (code) => {
        console.log(`🐍 Python process closed with code ${code}`);
        this.ready = false;
      });

      console.log('✅ Python inference service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Python service:', error.message);
      this.ready = false;
    }
  }

  /**
   * Send image to inference service and get detections
   * @param {Buffer} imageBuffer - Image data
   * @returns {Promise<Object>} Detections result
   */
  async detectLocal(imageBuffer) {
    return new Promise((resolve) => {
      if (!this.process || !this.process.stdout || !this.ready) {
        resolve({ detections: [], frame_width: 640, frame_height: 480 });
        return;
      }

      const base64Image = imageBuffer.toString('base64');
      const request = {
        image: base64Image,
        confidence: this.config.confidence
      };

      const responseHandler = (data) => {
        try {
          const result = JSON.parse(data.toString());

          if (result.success) {
            this.process.stdout.removeListener('data', responseHandler);
            resolve({
              detections: (result.detections || []).map(d => ({
                class: d.class,
                x: d.x,
                y: d.y,
                width: d.width,
                height: d.height,
                confidence: d.confidence,
                source: 'local'
              })),
              frame_width: result.frame_width,
              frame_height: result.frame_height
            });
          }
        } catch (error) {
          console.error('❌ Parse error:', error.message);
        }
      };

      this.process.stdout.once('data', responseHandler);

      try {
        this.process.stdin.write(JSON.stringify(request) + '\n');

        setTimeout(() => {
          this.process.stdout.removeListener('data', responseHandler);
          resolve({ detections: [], frame_width: 640, frame_height: 480 });
        }, 10000);
      } catch (error) {
        resolve({ detections: [], frame_width: 640, frame_height: 480 });
      }
    });
  }

  /**
   * Shutdown inference service
   */
  shutdown() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
      this.ready = false;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      ready: this.ready,
      running: this.process !== null
    };
  }
}
