import axios from 'axios';
import fs from 'fs';
import { spawn } from 'child_process';

/**
 * Simple Roboflow PPE Detection Tester
 * Tests API connectivity and detection capabilities
 */
class RoboflowTester {
  constructor(apiKey, model = 'ppe-detection-t01qg', version = '6') {
    this.apiKey = apiKey;
    this.model = model;
    this.version = version;
    this.baseUrl = 'https://detect.roboflow.com';
  }

  /**
   * Test 1: Check API connectivity
   */
  async testConnection() {
    console.log('\n🔌 Test 1: Testing API Connection...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const testUrl = `${this.baseUrl}/${this.model}/${this.version}`;
      console.log(`📡 Endpoint: ${testUrl}`);
      console.log(`🔑 API Key: ${this.apiKey.substring(0, 20)}...`);
      
      // Test with a simple image URL
      const response = await axios.post(testUrl, {
        image: "https://source.roboflow.com/pwYAiaetamBLofHfVuD4/YDout1WnT4HvJCXkFn6u/original.jpg"
      }, {
        params: { api_key: this.apiKey },
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ Connection successful!');
      console.log(`📊 Status: ${response.status}`);
      console.log(`📊 Detections: ${response.data.predictions?.length || 0} objects found`);
      return true;
    } catch (error) {
      console.log('❌ Connection failed!');
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Error: ${JSON.stringify(error.response.data)}`);
      } else {
        console.log(`   Error: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Test 2: Detect PPE from video file
   */
  async testPPEDetection(videoPath) {
    console.log('\n🎯 Test 2: Testing PPE Detection from Video...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check if video file exists
    if (!fs.existsSync(videoPath)) {
      console.log(`❌ Video file not found: ${videoPath}`);
      return false;
    }
    
    console.log(`📹 Video: ${videoPath}`);
    console.log('📸 Extracting frame...');
    
    try {
      // Extract a single frame from video
      const frameBuffer = await this.extractFrame(videoPath);
      console.log(`✅ Frame extracted: ${frameBuffer.length} bytes`);
      
      // Send to Roboflow
      console.log('🚀 Sending to Roboflow API...');
      const detections = await this.detectPPE(frameBuffer);
      
      console.log(`✅ Detection successful!`);
      console.log(`📊 Found ${detections.length} objects\n`);
      
      // Display results
      this.displayResults(detections);
      
      return true;
    } catch (error) {
      console.log('❌ Detection failed!');
      console.log(`   Error: ${error.message}`);
      return false;
    }
  }

  /**
   * Test 3: Detect PPE from image file
   */
  async testPPEDetectionFromImage(imagePath) {
    console.log('\n🖼️  Test 3: Testing PPE Detection from Image...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (!fs.existsSync(imagePath)) {
      console.log(`❌ Image file not found: ${imagePath}`);
      return false;
    }
    
    console.log(`📷 Image: ${imagePath}`);
    
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      console.log(`✅ Image loaded: ${imageBuffer.length} bytes`);
      
      console.log('🚀 Sending to Roboflow API...');
      const detections = await this.detectPPE(imageBuffer);
      
      console.log(`✅ Detection successful!`);
      console.log(`📊 Found ${detections.length} objects\n`);
      
      this.displayResults(detections);
      
      return true;
    } catch (error) {
      console.log('❌ Detection failed!');
      console.log(`   Error: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract a single frame from video using FFmpeg
   */
  async extractFrame(videoPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-frames:v', '1',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-q:v', '2',
        '-'
      ]);

      let buffer = Buffer.alloc(0);
      let errorOutput = '';

      ffmpeg.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
      });

      ffmpeg.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString();
      });

      ffmpeg.on('error', (error) => {
        if (error.code === 'ENOENT') {
          reject(new Error('FFmpeg not found. Install with: sudo apt-get install ffmpeg'));
        } else {
          reject(error);
        }
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg failed with code ${code}: ${errorOutput}`));
        } else if (buffer.length === 0) {
          reject(new Error('No frame data extracted'));
        } else {
          resolve(buffer);
        }
      });
    });
  }

  /**
   * Send image to Roboflow API for detection
   */
  async detectPPE(imageBuffer, confidence = 0.5, overlap = 0.5) {
    const url = `${this.baseUrl}/${this.model}/${this.version}`;
    
    const response = await axios.post(url, imageBuffer, {
      params: {
        api_key: this.apiKey,
        confidence: confidence,
        overlap: overlap
      },
      headers: {
        'Content-Type': 'image/jpeg'
      },
      timeout: 30000
    });

    return response.data.predictions || [];
  }

  /**
   * Display detection results in a nice format
   */
  displayResults(detections) {
    if (detections.length === 0) {
      console.log('ℹ️  No objects detected');
      return;
    }

    console.log('Detection Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Group by class
    const grouped = {};
    detections.forEach(det => {
      if (!grouped[det.class]) {
        grouped[det.class] = [];
      }
      grouped[det.class].push(det);
    });

    // Display grouped results
    Object.keys(grouped).forEach(className => {
      const items = grouped[className];
      const avgConfidence = (items.reduce((sum, item) => sum + item.confidence, 0) / items.length * 100).toFixed(1);
      
      const emoji = this.getEmoji(className);
      console.log(`\n${emoji} ${className.toUpperCase()}`);
      console.log(`   Count: ${items.length}`);
      console.log(`   Avg Confidence: ${avgConfidence}%`);
      
      items.forEach((item, idx) => {
        console.log(`   #${idx + 1}: ${(item.confidence * 100).toFixed(1)}% at (${item.x.toFixed(0)}, ${item.y.toFixed(0)})`);
      });
    });

    // PPE Compliance Check
    console.log('\n🛡️  PPE Compliance Analysis:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.analyzePPECompliance(grouped);
  }

  /**
   * Analyze PPE compliance based on detections
   */
  analyzePPECompliance(grouped) {
    const persons = grouped['person'] || [];
    const helmets = grouped['helmet'] || [];
    const vests = grouped['vest'] || grouped['safety-vest'] || [];
    
    console.log(`👤 Persons detected: ${persons.length}`);
    console.log(`⛑️  Helmets detected: ${helmets.length}`);
    console.log(`🦺 Vests detected: ${vests.length}`);
    
    if (persons.length === 0) {
      console.log('\n✅ No persons in frame - N/A');
      return;
    }

    const issues = [];
    
    if (helmets.length < persons.length) {
      issues.push(`⚠️  Missing helmets: ${persons.length - helmets.length} person(s) without helmet`);
    }
    
    if (vests.length < persons.length) {
      issues.push(`⚠️  Missing vests: ${persons.length - vests.length} person(s) without vest`);
    }

    if (issues.length === 0) {
      console.log('\n✅ COMPLIANT - All PPE detected');
    } else {
      console.log('\n❌ VIOLATION DETECTED:');
      issues.forEach(issue => console.log(`   ${issue}`));
    }
  }

  /**
   * Get emoji for object class
   */
  getEmoji(className) {
    const emojis = {
      'person': '👤',
      'helmet': '⛑️',
      'vest': '🦺',
      'safety-vest': '🦺',
      'no-helmet': '❌',
      'no-vest': '❌'
    };
    return emojis[className.toLowerCase()] || '📦';
  }

  /**
   * Run all tests
   */
  async runAllTests(videoPath) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║          🛡️  ROBOFLOW PPE DETECTION TESTER                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    const results = {
      connection: false,
      detection: false
    };

    // Test 1: Connection
    results.connection = await this.testConnection();
    
    if (!results.connection) {
      console.log('\n❌ Connection test failed. Please check your API key and model configuration.');
      return results;
    }

    // Test 2: Detection from video
    if (videoPath) {
      results.detection = await this.testPPEDetection(videoPath);
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                      📊 TEST SUMMARY                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`   Connection Test: ${results.connection ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Detection Test:  ${results.detection ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('');

    return results;
  }
}

export default RoboflowTester;