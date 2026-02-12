#!/usr/bin/env python3
"""
Test Model with Video Files - Extract frames and test detection
"""

import cv2
import requests
import json
import os
from datetime import datetime
from pathlib import Path

# Configuration
API_URL = "http://localhost:9001"
CLOUD_API = "https://detect.roboflow.com"
MODEL = os.getenv("ROBOFLOW_MODEL", "ppe-detection-soydn")
VERSION = os.getenv("ROBOFLOW_VERSION", "1")
API_KEY = os.getenv("ROBOFLOW_API_KEY", "jlY9qpN7ZBI9Ay5V1xEW")
CONFIDENCE = float(os.getenv("ROBOFLOW_CONFIDENCE", "0.4"))
OVERLAP = float(os.getenv("ROBOFLOW_OVERLAP", "0.3"))

TEST_DIR = Path("./test_output")
TEST_DIR.mkdir(exist_ok=True)

def test_video_file(video_path, num_frames=3):
    """Test model with frames from video file"""
    print("\n" + "="*80)
    print(f"🎬 TESTING VIDEO: {Path(video_path).name}")
    print("="*80)
    
    # Open video
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"❌ Cannot open video: {video_path}")
        return
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"\n📊 VIDEO INFO:")
    print(f"   Total Frames: {total_frames}")
    print(f"   FPS: {fps}")
    print(f"   Resolution: {width}x{height}")
    
    # Extract frames at intervals
    frame_indices = []
    if total_frames > num_frames:
        step = total_frames // num_frames
        frame_indices = [i * step for i in range(num_frames)]
    else:
        frame_indices = list(range(total_frames))
    
    print(f"\n📽️  Extracting {len(frame_indices)} frames...")
    
    tested_frames = 0
    total_detections = 0
    persons_found = 0
    
    for idx, frame_num in enumerate(frame_indices):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()
        
        if not ret:
            print(f"   ⚠️  Frame {frame_num}: Failed to read")
            continue
        
        print(f"\n   [{idx+1}/{len(frame_indices)}] Frame {frame_num}...")
        
        # Test frame
        result = test_frame(frame, f"video_{Path(video_path).stem}_frame{frame_num}")
        
        if result:
            tested_frames += 1
            total_detections += result.get("detections", 0)
            persons_found += result.get("persons", 0)
            
            print(f"       ✅ Detections: {result['detections']}, Persons: {result['persons']}")
    
    cap.release()
    
    # Summary
    print("\n" + "="*80)
    print(f"📊 VIDEO TEST SUMMARY")
    print("="*80)
    print(f"Frames Tested: {tested_frames}")
    print(f"Total Detections: {total_detections}")
    print(f"Total Persons: {persons_found}")
    
    if persons_found > 0:
        print(f"✅ Model IS detecting persons!")
    else:
        print(f"⚠️  Model NOT detecting persons - check video content or lighting")


def test_frame(frame, label=""):
    """Test single frame with model"""
    try:
        # Encode frame
        _, frame_bytes = cv2.imencode(".jpg", frame)
        
        files = {"file": ("frame.jpg", frame_bytes.tobytes(), "image/jpeg")}
        params = {
            "api_key": API_KEY,
            "confidence": CONFIDENCE,
            "overlap": OVERLAP
        }
        
        # Try local API first
        response = requests.post(
            f"{API_URL}/{MODEL}/{VERSION}",
            files=files,
            params=params,
            timeout=10
        )
        
        # Fallback to cloud API if needed
        if response.status_code != 200:
            response = requests.post(
                f"{CLOUD_API}/{MODEL}/{VERSION}",
                files=files,
                params=params,
                timeout=10
            )
        
        if response.status_code != 200:
            print(f"       ❌ API Error {response.status_code}")
            return None
        
        predictions = response.json()
        preds = predictions.get("predictions", [])
        persons = [p for p in preds if "person" in p.get("class", "").lower()]
        
        # Save result
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        json_path = TEST_DIR / f"result_{label}_{timestamp}.json"
        with open(json_path, "w") as f:
            json.dump(predictions, f, indent=2)
        
        return {
            "detections": len(preds),
            "persons": len(persons)
        }
    
    except Exception as e:
        print(f"       ❌ Error: {e}")
        return None


def main():
    """Main test routine"""
    print("\n" + "="*80)
    print("🎬 PPE MODEL VIDEO TEST")
    print("="*80)
    
    # Find video files
    video_files = list(Path(".").glob("*.mp4")) + list(Path(".").glob("*.h264"))
    
    if not video_files:
        print("❌ No video files found")
        return
    
    print(f"\n📹 Found {len(video_files)} video files:")
    for i, vf in enumerate(video_files, 1):
        print(f"   {i}. {vf.name} ({vf.stat().st_size / 1024 / 1024:.1f} MB)")
    
    # Test each video
    for video_file in video_files:
        test_video_file(video_file, num_frames=3)
    
    print("\n" + "="*80)
    print("✅ Video testing complete!")
    print(f"📂 Results saved to: {TEST_DIR}")


if __name__ == "__main__":
    main()
