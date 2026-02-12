#!/usr/bin/env python3
"""
Test script to validate local model detection (YOLOv8l for persons and hardhat-best.pt for hats)
"""

import cv2
import json
import base64
from pathlib import Path
import sys

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Import inference functions
from inference_service import decode_image, detect_persons, detect_hathats, process_frame

def test_with_image_file(image_path):
    """Test with an actual image file"""
    print(f"\n🧪 Testing with image: {image_path}")
    print("=" * 60)
    
    if not Path(image_path).exists():
        print(f"❌ Image not found: {image_path}")
        return
    
    # Read image and encode to base64
    with open(image_path, 'rb') as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')
    
    # Test frame processing
    result = process_frame(image_data, conf_threshold=0.5)
    
    print(f"✅ Processing result:")
    print(f"   Success: {result.get('success')}")
    print(f"   Frame dimensions: {result.get('frame_width')}x{result.get('frame_height')}")
    print(f"   Total detections: {len(result.get('detections', []))}")
    print(f"   Persons found: {result.get('person_count', 0)}")
    print(f"   Hard hats found: {result.get('hardhat_count', 0)}")
    
    if result.get('success'):
        detections = result.get('detections', [])
        if detections:
            print(f"\n📊 Detections:")
            for det in detections:
                print(f"   - {det['class']}: {det['confidence']*100:.1f}% @ ({det['x']:.0f}, {det['y']:.0f})")
        else:
            print("   No detections found")
    else:
        print(f"   Error: {result.get('error')}")

def test_webcam_frame():
    """Test with actual webcam frame if available"""
    print(f"\n🧪 Testing with webcam frame")
    print("=" * 60)
    
    try:
        cap = cv2.VideoCapture('/dev/video0')
        if not cap.isOpened():
            print("⚠️  Webcam not available (/dev/video0)")
            return
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            print("❌ Failed to read from webcam")
            return
        
        # Convert to JPEG and base64
        success, encoded_image = cv2.imencode('.jpg', frame)
        if not success:
            print("❌ Failed to encode frame")
            return
        
        image_data = base64.b64encode(encoded_image.tobytes()).decode('utf-8')
        
        # Test person detection
        persons = detect_persons(frame, conf_threshold=0.5)
        print(f"✅ Persons detected: {len(persons)}")
        for p in persons:
            print(f"   - Person: {p['confidence']*100:.1f}% @ ({p['x']:.0f}, {p['y']:.0f})")
        
        # Test hardhat detection
        hathats = detect_hathats(frame, conf_threshold=0.5)
        print(f"✅ Hard hats detected: {len(hathats)}")
        for h in hathats:
            print(f"   - {h['class']}: {h['confidence']*100:.1f}% @ ({h['x']:.0f}, {h['y']:.0f})")
            
    except Exception as e:
        print(f"⚠️  Webcam test failed: {e}")

if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("🤖 LOCAL MODEL INFERENCE TEST")
    print("=" * 60)
    
    # Test with available test images
    test_images = [
        './test-frame.jpg',
        './frame.jpg',
        './test_output/test_visualized_20260211_172916.jpg'
    ]
    
    for img_path in test_images:
        if Path(img_path).exists():
            test_with_image_file(img_path)
            break
    else:
        print("⚠️  No test images found, skipping file test")
    
    # Test with webcam
    test_webcam_frame()
    
    print("\n" + "=" * 60)
    print("✅ Test completed")
    print("=" * 60)
