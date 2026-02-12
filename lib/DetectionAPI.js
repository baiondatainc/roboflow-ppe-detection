/**
 * DetectionAPI
 * Handles external API calls (Roboflow, etc.)
 * Single Responsibility: API communication
 */

import axios from 'axios';
import FormData from 'form-data';

export class DetectionAPI {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model,
      version: config.version,
      confidence: config.confidence || 0.55,
      overlap: config.overlap || 0.3,
      timeout: config.timeout || 10000
    };
  }

  /**
   * Get detections from Roboflow API
   * @param {Buffer} imageBuffer - Image data
   * @returns {Promise<Object>} API response with predictions
   */
  async getRoboflowDetections(imageBuffer) {
    try {
      const form = new FormData();
      form.append('file', imageBuffer, {
        filename: 'webcam-frame.jpg',
        contentType: 'image/jpeg'
      });

      const url = `https://detect.roboflow.com/${this.config.model}/${this.config.version}`;

      const response = await axios.post(url, form, {
        params: {
          api_key: this.config.apiKey,
          confidence: this.config.confidence,
          overlap: this.config.overlap,
          image_info: true
        },
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: this.config.timeout
      });

      return {
        predictions: (response.data.predictions || []).map(p => ({
          ...p,
          source: 'roboflow'
        })),
        image: response.data.image
      };
    } catch (e) {
      console.error('❌ Roboflow API Error:', e.message);
      return { predictions: [], image: null };
    }
  }

  /**
   * Validate API configuration
   */
  isConfigured() {
    return !!(this.config.apiKey && this.config.model && this.config.version);
  }

  /**
   * Get API configuration status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      model: this.config.model,
      version: this.config.version
    };
  }
}
