#!/usr/bin/env node
/**
 * Diagnostic Script for Roboflow PPE Detection
 * Tests video frame extraction and Roboflow API independently
 */

import { spawn } from 'child_process';
import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const VIDEO_FILE = process.env.VIDEO_FILE || './ppe-upload-video-new1.mp4';
const API_KEY = process.env.ROBOFLOW_API_KEY;
const MODEL = process.env.ROBOFLOW_MODEL;
const VERSION = process.env.ROBOFLOW_VERSION;

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          🔧 ROBOFLOW PPE DIAGNOSTIC TOOL                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

async function extractFrame() {
  return new Promise((resolve, reject) => {
    console.log('📹 Step 1: Extracting frame from video...');
    console.log(`   Video: ${VIDEO_FILE}`);

    const ffmpeg = spawn('ffmpeg', [
      '-ss', '00:00:01',
      '-i', VIDEO_FILE,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', '2',
      '-'
    ]);

    let buffer = Buffer.alloc(0);
    let stderr = '';

    ffmpeg.stdout.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
    });

    ffmpeg.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', err => {
      if (err.code === 'ENOENT') {
        reject(new Error('FFmpeg not found. Install with: sudo apt-get install ffmpeg'));
      } else {
        reject(err);
      }
    });

    ffmpeg.on('close', code => {
      if (code !== 0) {
        console.log('   ❌ FFmpeg failed');
        console.log('   Error output:', stderr.slice(-200));
        reject(new Error(`FFmpeg exit code: ${code}`));
      } else if (buffer.length === 0) {
        reject(new Error('No frame data extracted'));
      } else {
        console.log(`   ✅ Frame extracted: ${buffer.length} bytes`);
        resolve(buffer);
      }
    });
  });
}

async function testRoboflow(imageBuffer) {
  console.log('\n🚀 Step 2: Testing Roboflow API...');
  console.log(`   Endpoint: https://detect.roboflow.com/${MODEL}/${VERSION}`);
  console.log(`   Frame size: ${imageBuffer.length} bytes`);

  try {
    const response = await axios.post(
      `https://detect.roboflow.com/${MODEL}/${VERSION}`,
      imageBuffer,
      {
        params: {
          api_key: API_KEY,
          confidence: 0.4,
          overlap: 0.3
        },
        headers: {
          'Content-Type': 'image/jpeg'
        },
        timeout: 30000
      }
    );

    console.log('   ✅ API call successful!');
    console.log(`   📊 Status: ${response.status}`);
    
    const predictions = response.data.predictions || [];
    console.log(`   📊 Detections: ${predictions.length} objects\n`);

    if (predictions.length > 0) {
      console.log('   Detected objects:');
      const summary = {};
      predictions.forEach(p => {
        summary[p.class] = (summary[p.class] || 0) + 1;
      });
      
      Object.entries(summary).forEach(([className, count]) => {
        console.log(`      • ${className}: ${count}`);
      });
      
      console.log('\n   Sample detection:');
      const sample = predictions[0];
      console.log(`      Class: ${sample.class}`);
      console.log(`      Confidence: ${(sample.confidence * 100).toFixed(1)}%`);
      console.log(`      Position: (${sample.x.toFixed(0)}, ${sample.y.toFixed(0)})`);
    } else {
      console.log('   ℹ️  No objects detected in this frame');
      console.log('   Try adjusting confidence threshold or using different frame');
    }

    return response.data;

  } catch (error) {
    console.log('   ❌ API call failed!');
    
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Error:`, error.response.data);
      
      if (error.response.status === 400) {
        console.log('\n   💡 Troubleshooting:');
        console.log('      - Check if image is valid JPEG');
        console.log('      - Try lower quality setting (-q:v 5)');
        console.log('      - Verify video codec is supported');
      } else if (error.response.status === 403) {
        console.log('\n   💡 Troubleshooting:');
        console.log('      - API key may not have access to this model');
        console.log('      - Try a different model or fork a public one');
      }
    } else {
      console.log(`   Error: ${error.message}`);
    }
    
    throw error;
  }
}

async function saveFrame(buffer) {
  const outputPath = './test-frame.jpg';
  fs.writeFileSync(outputPath, buffer);
  console.log(`\n💾 Frame saved to: ${outputPath}`);
  console.log('   You can inspect this file to verify quality\n');
}

async function main() {
  // Validate configuration
  if (!fs.existsSync(VIDEO_FILE)) {
    console.log(`❌ Video file not found: ${VIDEO_FILE}\n`);
    process.exit(1);
  }

  if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
    console.log('❌ ROBOFLOW_API_KEY not set in .env\n');
    process.exit(1);
  }

  try {
    // Extract frame
    const frame = await extractFrame();
    
    // Save for inspection
    await saveFrame(frame);
    
    // Test Roboflow
    await testRoboflow(frame);
    
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ ALL TESTS PASSED                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('Your configuration is working correctly!');
    console.log('You can now start the server: npm start\n');

  } catch (error) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ❌ DIAGNOSTIC FAILED                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`Error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
