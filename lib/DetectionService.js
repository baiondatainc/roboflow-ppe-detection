/**
 * DetectionService
 * Orchestrates detection pipeline
 * Dependency Inversion: Depends on abstractions, not concrete implementations
 */

export class DetectionService {
  constructor(config = {}) {
    this.localInference = config.localInference;
    this.roboflowAPI = config.roboflowAPI;
    this.broadcaster = config.broadcaster;

    this.config = {
      confidence: config.confidence || 0.55,
      ...config
    };

    this.detectionStats = {
      totalProcessed: 0,
      totalDetections: 0
    };
  }

  /**
   * Process frame with hybrid detection (local + Roboflow)
   * @param {Buffer} imageBuffer - Image data
   * @param {number} frameNumber - Frame number
   * @returns {Promise<Object>} Combined detections
   */
  async processFrame(imageBuffer, frameNumber) {
    try {
      // Run both models in parallel
      const [roboflowResults, localResults] = await Promise.allSettled([
        this.roboflowAPI.getRoboflowDetections(imageBuffer),
        this.localInference.detectLocal(imageBuffer)
      ]).then(results => [
        results[0].status === 'fulfilled' ? results[0].value : { predictions: [] },
        results[1].status === 'fulfilled' ? results[1].value : { detections: [] }
      ]);

      const roboflowPredictions = roboflowResults.predictions || [];
      const localPredictions = localResults.detections || [];

      // Filter predictions
      const filteredRoboflow = roboflowPredictions.filter(p => {
        const cls = p.class.toLowerCase();
        return cls.includes('vest') || cls.includes('glove') || cls.includes('jacket');
      });

      const filteredLocal = localPredictions.filter(p => {
        const cls = p.class.toLowerCase();
        return cls.includes('person') || cls.includes('hardhat') || cls.includes('helmet');
      });

      const allPredictions = [...filteredRoboflow, ...filteredLocal];

      // Update frame dimensions
      if (roboflowResults.image) {
        this.frameWidth = roboflowResults.image.width || 640;
        this.frameHeight = roboflowResults.image.height || 480;
      } else if (localResults.frame_width && localResults.frame_height) {
        this.frameWidth = localResults.frame_width;
        this.frameHeight = localResults.frame_height;
      } else {
        this.frameWidth = 640;
        this.frameHeight = 480;
      }

      // Update stats
      this.detectionStats.totalProcessed++;
      this.detectionStats.totalDetections += allPredictions.length;

      // Broadcast if detections found
      if (allPredictions.length > 0) {
        this.broadcaster.broadcastDetection({
          source: 'hybrid',
          frame: frameNumber,
          frameWidth: this.frameWidth,
          frameHeight: this.frameHeight,
          count: allPredictions.length,
          predictions: allPredictions.map(p => ({
            type: p.class,
            confidence: p.confidence,
            source: p.source || 'unknown',
            boundingBox: {
              x: p.x,
              y: p.y,
              width: p.width,
              height: p.height
            }
          })),
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ Frame #${frameNumber}: ${allPredictions.length} detections (RF: ${filteredRoboflow.length}, Local: ${filteredLocal.length})`);

      return {
        success: true,
        frameNumber,
        detections: allPredictions,
        stats: this.detectionStats
      };
    } catch (error) {
      console.error(`❌ Detection error (Frame #${frameNumber}):`, error.message);
      return {
        success: false,
        frameNumber,
        error: error.message
      };
    }
  }

  /**
   * Get detection service status
   */
  getStatus() {
    return {
      localInference: this.localInference.getStatus(),
      roboflowAPI: this.roboflowAPI.getStatus(),
      broadcaster: this.broadcaster.getStatus(),
      stats: this.detectionStats
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.detectionStats = {
      totalProcessed: 0,
      totalDetections: 0
    };
  }
}
