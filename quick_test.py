#!/usr/bin/env python3
"""
Quick Model Test - Simple script to test one camera frame
"""

import cv2
import requests
import json
import os
from datetime import datetime
from pathlib import Path

# Configuration
API_URL = "http://localhost:9001"
MODEL = os.getenv("ROBOFLOW_MODEL", "ppe-detection-soydn-wdpr0")
VERSION = os.getenv("ROBOFLOW_VERSION", "1")
API_KEY = os.getenv("ROBOFLOW_API_KEY", "jlY9qpN7ZBI9Ay5V1xEW")
CONFIDENCE = float(os.getenv("ROBOFLOW_CONFIDENCE", "0.4"))
OVERLAP = float(os.getenv("ROBOFLOW_OVERLAP", "0.3"))

TEST_DIR = Path("./test_output")
TEST_DIR.mkdir(exist_ok=True)

def test_webcam():
    """Test model with webcam frame"""
    print("\n" + "="*80)
    print("🎥 WEBCAM TEST")
    print("="*80)
    
    # Capture frame
    print("\n📷 Capturing webcam frame...")
    cap = cv2.VideoCapture(1)  # /dev/video1
    
    if not cap.isOpened():
        print("❌ Cannot open webcam. Trying /dev/video0...")
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("❌ Cannot open any webcam")
            return
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    # Warm up
    for _ in range(5):
        cap.read()
    
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        print("❌ Failed to capture frame")
        return
    
    print(f"✅ Frame captured: {frame.shape}")
    
    # Save original
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    orig_path = TEST_DIR / f"test_original_{timestamp}.jpg"
    cv2.imwrite(str(orig_path), frame)
    print(f"💾 Original saved: {orig_path}")
    
    # Send to model
    print(f"\n🎯 Sending to model: {API_URL}/{MODEL}/{VERSION}")
    print(f"   Confidence: {CONFIDENCE}, Overlap: {OVERLAP}")
    
    try:
        _, frame_bytes = cv2.imencode(".jpg", frame)
        
        files = {"file": ("frame.jpg", frame_bytes.tobytes(), "image/jpeg")}
        params = {
            "api_key": API_KEY,
            "confidence": CONFIDENCE,
            "overlap": OVERLAP
        }
        
        response = requests.post(
            f"{API_URL}/{MODEL}/{VERSION}",
            files=files,
            params=params,
            timeout=30
        )
        
        # Try cloud API if local server fails
        if response.status_code != 200:
            print(f"⚠️  Local server error {response.status_code}, trying cloud API...")
            cloud_url = f"https://detect.roboflow.com/{MODEL}/{VERSION}"
            print(f"   Fallback to: {cloud_url}")
            
            response = requests.post(
                cloud_url,
                files=files,
                params=params,
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"❌ Error: {response.status_code}")
                print(response.text)
                return
        
        predictions = response.json()
        
        # Print response
        print("\n📊 MODEL RESPONSE:")
        print(json.dumps(predictions, indent=2))
        
        # Save response
        json_path = TEST_DIR / f"test_response_{timestamp}.json"
        with open(json_path, "w") as f:
            json.dump(predictions, f, indent=2)
        print(f"\n💾 Response saved: {json_path}")
        
        # Analyze
        preds = predictions.get("predictions", [])
        print(f"\n📈 ANALYSIS:")
        print(f"   Total Detections: {len(preds)}")
        
        if preds:
            classes = {}
            for p in preds:
                cls = p.get("class", "unknown")
                conf = p.get("confidence", 0)
                if cls not in classes:
                    classes[cls] = []
                classes[cls].append(conf)
            
            print(f"\n   By Class:")
            for cls in sorted(classes.keys()):
                confs = classes[cls]
                print(f"      {cls}: {len(confs)} items, avg confidence: {sum(confs)/len(confs)*100:.1f}%")
            
            # Check for person
            persons = [p for p in preds if "person" in p.get("class", "").lower()]
            print(f"\n   👥 PERSONS DETECTED: {len(persons)}")
            if not persons:
                print("      ⚠️  WARNING: No persons detected in frame!")
        else:
            print("   ⚠️  No detections!")
        
        # Draw on frame
        frame_viz = frame.copy()
        for p in preds:
            x, y = int(p["x"]), int(p["y"])
            w, h = int(p["width"]), int(p["height"])
            conf = p["confidence"]
            cls = p["class"]
            
            x1, y1 = x - w//2, y - h//2
            x2, y2 = x + w//2, y + h//2
            
            color = (0, 255, 0) if conf > 0.7 else (0, 165, 255)
            cv2.rectangle(frame_viz, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame_viz, f"{cls} {conf:.2f}", (x1, y1-5),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        viz_path = TEST_DIR / f"test_visualized_{timestamp}.jpg"
        cv2.imwrite(str(viz_path), frame_viz)
        print(f"🎨 Visualized saved: {viz_path}")
        
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error - is the inference server running?")
        print("   Run: python -m roboflow.inference.server --port 9001")
        print("   Or check your API_KEY is valid for cloud API")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("🛡️  PPE MODEL QUICK TEST")
    test_webcam()
