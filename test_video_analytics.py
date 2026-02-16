#!/usr/bin/env python3
"""
Quick test script for Video Analytics service
Tests all major endpoints
"""

import requests
import json
import sys
from pathlib import Path
import time

# Configuration
ANALYTICS_API = "http://localhost:5002"
PLATE_API = "http://localhost:5001"

def test_health():
    """Test health endpoints"""
    print("\n🏥 Testing Health Endpoints...")
    print("-" * 50)
    
    try:
        # Test analytics health
        response = requests.get(f"{ANALYTICS_API}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Video Analytics Service: {data['status']}")
            print(f"   - YOLO Model: {data['yolo_model']}")
            print(f"   - ByteTrack: {data['bytetrack']}")
            print(f"   - Plate Service: {data['plate_service']}")
        else:
            print(f"❌ Analytics service returned {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to Video Analytics service (port 5002)")
        print("   Start it with: python video_analytics_service.py")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

def test_config():
    """Test configuration endpoint"""
    print("\n⚙️  Testing Configuration Endpoint...")
    print("-" * 50)
    
    try:
        response = requests.get(f"{ANALYTICS_API}/api/config", timeout=5)
        if response.status_code == 200:
            config = response.json()
            print("✅ Configuration retrieved:")
            for key, value in config.items():
                print(f"   - {key}: {value}")
        else:
            print(f"❌ Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

def test_calibration():
    """Test speed calibration"""
    print("\n📏 Testing Speed Calibration...")
    print("-" * 50)
    
    try:
        data = {
            "real_distance_m": 10.0,
            "pixel_distance": 100.0
        }
        
        response = requests.post(
            f"{ANALYTICS_API}/api/calibrate-speed",
            json=data,
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Calibration successful:")
            print(f"   {result['message']}")
            print(f"   Calculated: {result['pixels_per_meter']} pixels/meter")
        else:
            print(f"❌ Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

def test_frame_analysis():
    """Test frame analysis with a test image"""
    print("\n🖼️  Testing Frame Analysis...")
    print("-" * 50)
    
    # Create a simple test image
    import numpy as np
    import cv2
    
    try:
        # Create a simple test image (1280x720 BGR)
        test_image = np.ones((720, 1280, 3), dtype=np.uint8) * 100
        
        # Add some rectangles to simulate vehicles
        cv2.rectangle(test_image, (100, 100), (300, 400), (0, 255, 0), -1)
        cv2.rectangle(test_image, (500, 150), (800, 450), (0, 255, 0), -1)
        
        # Encode to JPEG
        success, buffer = cv2.imencode('.jpg', test_image)
        if not success:
            print("❌ Failed to encode test image")
            return False
        
        image_bytes = buffer.tobytes()
        
        # Send to API
        response = requests.post(
            f"{ANALYTICS_API}/api/analyze-frame",
            data=image_bytes,
            headers={'Content-Type': 'application/octet-stream'},
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                frame_data = result['results']
                print(f"✅ Frame analysis successful:")
                print(f"   - Frame ID: {frame_data['frame_id']}")
                print(f"   - Vehicles detected: {len(frame_data['vehicles'])}")
                
                for vehicle in frame_data['vehicles']:
                    print(f"\n   Vehicle #{vehicle['id']}:")
                    print(f"      - Confidence: {vehicle['confidence']}")
                    if vehicle['speed']:
                        print(f"      - Speed: {vehicle['speed']['speed_kmh']} km/h")
                    if vehicle['plate']:
                        print(f"      - Plate: {vehicle['plate']['number']}")
            else:
                print(f"❌ Analysis failed: {result.get('error', 'Unknown error')}")
                return False
        else:
            print(f"❌ Failed: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

def main():
    """Run all tests"""
    print("\n" + "="*50)
    print("🎥 VIDEO ANALYTICS SERVICE - TEST SUITE")
    print("="*50)
    
    results = {
        "Health Check": test_health(),
        "Configuration": test_config(),
        "Calibration": test_calibration(),
        "Frame Analysis": test_frame_analysis(),
    }
    
    print("\n" + "="*50)
    print("📊 TEST RESULTS SUMMARY")
    print("="*50)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = "✅ PASS" if passed_test else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Video Analytics service is ready.")
        print("\n📖 Next steps:")
        print("1. Visit http://localhost:5173 in your browser")
        print("2. Go to the 'Video Analytics' tab")
        print("3. Upload a video to analyze")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. See details above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
