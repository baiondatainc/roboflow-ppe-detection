#!/usr/bin/env node
import RoboflowTester from './RoboflowTester.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const API_KEY = process.env.ROBOFLOW_API_KEY || 'YOUR_API_KEY';
const MODEL = process.env.ROBOFLOW_MODEL || 'ppe-detection-t01qg';
const VERSION = process.env.ROBOFLOW_VERSION || '6';
const VIDEO_FILE = process.env.VIDEO_FILE || './ppe-upload-video-new1.mp4';

// Main test function
async function main() {
  // Validate API key
  if (API_KEY === 'YOUR_API_KEY') {
    console.log('❌ Error: ROBOFLOW_API_KEY not set in .env file');
    console.log('');
    console.log('Please create a .env file with:');
    console.log('ROBOFLOW_API_KEY=your-actual-api-key-here');
    console.log('ROBOFLOW_MODEL=ppe-detection-t01qg');
    console.log('ROBOFLOW_VERSION=6');
    process.exit(1);
  }

  // Create tester instance
  const tester = new RoboflowTester(API_KEY, MODEL, VERSION);

  // Run all tests
  await tester.runAllTests(VIDEO_FILE);
}

// Run tests
main().catch(error => {
  console.error('\n❌ Test failed with error:', error.message);
  process.exit(1);
});