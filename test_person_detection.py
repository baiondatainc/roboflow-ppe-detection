#!/usr/bin/env python3
"""
Person Detection Validator
Specifically tests why persons aren't showing up in the UI
"""

import cv2
import requests
import json
import os
from datetime import datetime
from pathlib import Path

API_URL = "http://localhost:9001"
MODEL = os.getenv("ROBOFLOW_MODEL", "ppe-detection-soydn")
VERSION = os.getenv("ROBOFLOW_VERSION", "1")
API_KEY = os.getenv("ROBOFLOW_API_KEY", "")
CONFIDENCE = float(os.getenv("ROBOFLOW_CONFIDENCE", "0.4"))

TEST_DIR = Path("./test_output")
TEST_DIR.mkdir(exist_ok=True)

def check_person_detection():
    """Test person detection specifically"""
    
    print("\n" + "="*80)
    print("👥 PERSON DETECTION VALIDATOR")
    print("="*80)
    
    # Capture frame
    print("\n📷 Capturing webcam frame...")
    cap = cv2.VideoCapture(1)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    for _ in range(5):
        cap.read()
    
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        print("❌ Failed to capture frame")
        return False
    
    print(f"✅ Frame captured: {frame.shape}")
    
    # Send to model
    print(f"\n🎯 Sending to model at {API_URL}/{MODEL}/{VERSION}")
    
    try:
        _, frame_bytes = cv2.imencode(".jpg", frame)
        
        response = requests.post(
            f"{API_URL}/{MODEL}/{VERSION}",
            files={"file": ("frame.jpg", frame_bytes.tobytes(), "image/jpeg")},
            params={
                "api_key": API_KEY,
                "confidence": CONFIDENCE,
                "overlap": 0.3
            },
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ Error: {response.status_code}")
            return False
        
        data = response.json()
        preds = data.get("predictions", [])
        
        # Analysis
        print(f"\n📊 MODEL RESPONSE ANALYSIS")
        print("-" * 80)
        print(f"Total Detections: {len(preds)}")
        
        # Find persons
        persons = [p for p in preds if p.get("class", "").lower() == "person"]
        print(f"\n👥 PERSON DETECTIONS: {len(persons)}")
        
        if persons:
            print("   ✅ PERSONS FOUND IN RESPONSE!")
            for i, p in enumerate(persons, 1):
                conf = p.get("confidence", 0)
                x, y = p.get("x"), p.get("y")
                w, h = p.get("width"), p.get("height")
                print(f"\n   [{i}] Person Detection")
                print(f"       ├─ Confidence: {conf*100:.2f}%")
                print(f"       ├─ Position: ({x}, {y})")
                print(f"       ├─ Size: {w}x{h}")
                print(f"       └─ Passes threshold: {conf >= CONFIDENCE}")
        else:
            print("   ❌ NO PERSONS FOUND IN RESPONSE!")
            print("\n   This means the MODEL is not detecting persons!")
            print("   Possible causes:")
            print("      • Person is too small in frame")
            print("      • Person is obscured")
            print("      • Model not trained on this scenario")
            print("      • Inference server is using wrong model")
        
        # Show what was detected
        print(f"\n📋 OTHER DETECTIONS:")
        print("-" * 80)
        
        classes = {}
        for p in preds:
            cls = p.get("class", "unknown")
            if cls not in classes:
                classes[cls] = []
            classes[cls].append(p.get("confidence", 0))
        
        if classes:
            for cls in sorted(classes.keys()):
                confs = classes[cls]
                avg_conf = sum(confs) / len(confs) * 100
                print(f"   {cls}: {len(confs)} items, avg confidence {avg_conf:.1f}%")
        else:
            print("   No other detections")
        
        # Save debug info
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save frame
        frame_path = TEST_DIR / f"person_test_frame_{timestamp}.jpg"
        cv2.imwrite(str(frame_path), frame)
        
        # Save response
        json_path = TEST_DIR / f"person_test_response_{timestamp}.json"
        with open(json_path, "w") as f:
            json.dump({
                "predictions": preds,
                "person_count": len(persons),
                "all_classes": list(classes.keys()),
                "model": f"{MODEL}/{VERSION}",
                "confidence_threshold": CONFIDENCE
            }, f, indent=2)
        
        # Draw on frame
        frame_viz = frame.copy()
        
        # Draw ALL detections
        for p in preds:
            x, y = int(p["x"]), int(p["y"])
            w, h = int(p["width"]), int(p["height"])
            conf = p["confidence"]
            cls = p["class"]
            
            x1, y1 = x - w//2, y - h//2
            x2, y2 = x + w//2, y + h//2
            
            # Highlight persons in green, others in blue
            color = (0, 255, 0) if cls.lower() == "person" else (255, 0, 0)
            
            cv2.rectangle(frame_viz, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame_viz, f"{cls} {conf:.2f}", (x1, y1-10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        viz_path = TEST_DIR / f"person_test_viz_{timestamp}.jpg"
        cv2.imwrite(str(viz_path), frame_viz)
        
        print(f"\n💾 FILES SAVED:")
        print(f"   Frame: {frame_path}")
        print(f"   Response: {json_path}")
        print(f"   Visualization: {viz_path}")
        
        return len(persons) > 0
    
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to inference server")
        print("   Start it with: python -m roboflow.inference.server --port 9001")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def check_server_parsing():
    """Check if server.js properly parses person detections"""
    
    print("\n" + "="*80)
    print("🔍 SERVER PARSING CHECK")
    print("="*80)
    
    print("\nThe server.js should:")
    print("  1. Receive prediction with class='person'")
    print("  2. Count persons in compliance analysis")
    print("  3. Send personCount to UI via WebSocket")
    
    print("\nChecks in server.js:")
    print("  ✓ processWebcamFrame() filters: p.class.toLowerCase().includes('person')")
    print("  ✓ processFrame() filters: p.class.toLowerCase().includes('person')")
    
    print("\nCheck your server logs for:")
    print("  👥 Persons Detected: X")
    print("  (This should be > 0 if persons are in the model response)")

def check_ui_filtering():
    """Check if UI properly handles person detections"""
    
    print("\n" + "="*80)
    print("🎨 UI FILTERING CHECK")
    print("="*80)
    
    print("\nIn WebcamViewer.vue, the UI should:")
    print("  1. Receive person detections from server")
    print("  2. Update personCount state")
    print("  3. Display 'Persons Detected: X'")
    
    print("\nKey code locations:")
    print("  • Line ~13: const personCount = ref(0)")
    print("  • Line ~456: personCount.value = data.predictions.filter(p => ...")
    print("  • Line ~687: <div class='person-count-display'>")
    print("  • Line ~690: <div class='count-value'>{{ personCount }}</div>")

if __name__ == "__main__":
    print("\n🛡️  PERSON DETECTION DEBUG WORKFLOW\n")
    
    # Step 1: Test model
    print("STEP 1: Testing Model Response")
    print("=" * 80)
    has_persons = check_person_detection()
    
    # Step 2: Check server parsing
    print("\n\nSTEP 2: Checking Server Parsing")
    check_server_parsing()
    
    # Step 3: Check UI filtering
    print("\n\nSTEP 3: Checking UI Filtering")
    check_ui_filtering()
    
    # Summary
    print("\n" + "="*80)
    print("📋 RESULTS")
    print("="*80)
    
    if has_persons:
        print("\n✅ Model IS detecting persons")
        print("\nIF persons don't show in UI:")
        print("  1. Check server.js console output")
        print("  2. Check WebSocket messages in browser DevTools")
        print("  3. Verify personCount updates in Vue DevTools")
    else:
        print("\n❌ Model is NOT detecting persons")
        print("\nTo fix:")
        print("  1. Ensure person is clearly visible in frame")
        print("  2. Check model version/training data")
        print("  3. Try different confidence threshold")
        print("  4. Verify inference server is running correct model")
    
    print("\n" + "="*80 + "\n")
