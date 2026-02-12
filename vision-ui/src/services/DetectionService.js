/**
 * DetectionService
 * Handles detection data parsing and filtering
 * Single Responsibility: Detection data processing only
 */

export class DetectionService {
  constructor(config = {}) {
    this.HARDHAT_MIN_CONFIDENCE = config.hardhatMinConfidence || 0.8;
    this.frameWidth = 640;
    this.frameHeight = 480;
  }

  parseDetectionData(data) {
    if (!data || !data.predictions) {
      return { predictions: [], frameWidth: 640, frameHeight: 480 };
    }

    return {
      frame: data.frame,
      timestamp: data.timestamp,
      predictions: data.predictions,
      frameWidth: data.frameWidth || this.frameWidth,
      frameHeight: data.frameHeight || this.frameHeight,
      source: data.source,
      count: data.count || data.predictions.length
    };
  }

  filterForDisplay(predictions) {
    return predictions.filter(p => {
      const normalizedType = p.type.toLowerCase().replace(/[_-]/g, '');

      // Exclude standalone head from display
      if (normalizedType.includes('head') && 
          !normalizedType.includes('hardhat') && 
          !normalizedType.includes('helmet')) {
        return false;
      }

      // Apply confidence filter to hardhat/helmet
      if ((normalizedType.includes('hardhat') || normalizedType.includes('helmet')) &&
          p.confidence < this.HARDHAT_MIN_CONFIDENCE) {
        return false;
      }

      return true;
    });
  }

  extractPPEStatus(predictions) {
    const status = {
      hardhat: { present: false, confidence: 0, lastSeen: null },
      helmet: { present: false, confidence: 0, lastSeen: null },
      head: { present: false, confidence: 0, lastSeen: null },
      gloves: { present: false, confidence: 0, lastSeen: null },
      hand: { present: false, confidence: 0, lastSeen: null },
      vest: { present: false, confidence: 0, lastSeen: null },
      safety_vest: { present: false, confidence: 0, lastSeen: null },
      person: { present: false, confidence: 0, lastSeen: null }
    };

    const now = Date.now();

    predictions.forEach(p => {
      const normalizedType = p.type.toLowerCase().replace(/[_-]/g, '');

      if (normalizedType.includes('person')) {
        status.person = { present: true, confidence: p.confidence, lastSeen: now };
      }

      if (p.confidence >= this.HARDHAT_MIN_CONFIDENCE) {
        if (normalizedType.includes('hardhat')) {
          status.hardhat = { present: true, confidence: p.confidence, lastSeen: now };
        } else if (normalizedType.includes('helmet')) {
          status.helmet = { present: true, confidence: p.confidence, lastSeen: now };
        } else if (normalizedType.includes('head')) {
          status.head = { present: true, confidence: p.confidence, lastSeen: now };
        }

        if (normalizedType.includes('glove')) {
          status.gloves = { present: true, confidence: p.confidence, lastSeen: now };
        } else if (normalizedType.includes('hand')) {
          status.hand = { present: true, confidence: p.confidence, lastSeen: now };
        }

        if (normalizedType.includes('vest')) {
          status.vest = { present: true, confidence: p.confidence, lastSeen: now };
        } else if (normalizedType.includes('safety')) {
          status.safety_vest = { present: true, confidence: p.confidence, lastSeen: now };
        }
      }
    });

    return status;
  }

  createAnnotation(prediction, frame, source) {
    return {
      type: prediction.type,
      frame: frame,
      confidence: prediction.confidence,
      timestamp: new Date().toISOString(),
      source: source,
      boundingBox: prediction.boundingBox
    };
  }

  getStatus() {
    return {
      hardhatMinConfidence: this.HARDHAT_MIN_CONFIDENCE,
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight
    };
  }
}
