#!/usr/bin/env python3
"""
Frame Diagnosis Tool - Analyze why model isn't detecting objects
"""

import cv2
import json
import os
from datetime import datetime
from pathlib import Path

def analyze_frame():
    """Capture and analyze frame"""
    print("\n" + "="*80)
    print("🔍 FRAME DIAGNOSIS TOOL")
    print("="*80)
    
    # Capture frame
    print("\n📷 Capturing frame from webcam...")
    cap = cv2.VideoCapture(1)
    
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("❌ Cannot open webcam")
            return
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    for _ in range(5):
        cap.read()
    
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        print("❌ Failed to capture")
        return
    
    print(f"✅ Frame captured: {frame.shape}")
    
    # Save frame
    TEST_DIR = Path("./test_output")
    TEST_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    frame_path = TEST_DIR / f"diagnosis_frame_{timestamp}.jpg"
    cv2.imwrite(str(frame_path), frame)
    print(f"💾 Frame saved: {frame_path}")
    
    # Analyze frame properties
    print("\n" + "="*80)
    print("📊 FRAME ANALYSIS")
    print("="*80)
    
    # Size
    height, width = frame.shape[:2]
    print(f"\n📐 DIMENSIONS: {width}x{height}")
    
    # Color space
    if len(frame.shape) == 3:
        channels = frame.shape[2]
        print(f"🎨 COLOR CHANNELS: {channels} (BGR)")
    
    # Brightness
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    brightness = gray.mean()
    print(f"💡 BRIGHTNESS: {brightness:.1f}/255")
    
    if brightness < 50:
        print("   ⚠️  VERY DARK - Detection will struggle")
    elif brightness < 100:
        print("   ⚠️  DARK - Detection may be poor")
    elif brightness > 200:
        print("   ⚠️  VERY BRIGHT - May have glare/washout")
    else:
        print("   ✅ Good lighting")
    
    # Contrast
    contrast = gray.std()
    print(f"📊 CONTRAST: {contrast:.1f}")
    
    if contrast < 20:
        print("   ⚠️  LOW CONTRAST - Objects blend into background")
    elif contrast > 100:
        print("   ✅ Good contrast")
    else:
        print("   ✅ Acceptable contrast")
    
    # Motion blur detection
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    sharpness = laplacian.var()
    print(f"🔍 SHARPNESS: {sharpness:.1f}")
    
    if sharpness < 100:
        print("   ⚠️  BLURRY - Motion blur or focus issue")
    else:
        print("   ✅ Sharp image")
    
    # Check for people/objects presence
    print("\n" + "="*80)
    print("👥 OBJECT PRESENCE CHECK")
    print("="*80)
    
    print("\n❓ Is there a person visible in the webcam?")
    print("   To debug, check:")
    print("   1. Is the person actually visible on screen right now?")
    print("   2. Is the person large enough in frame? (occupies ~10% or more)")
    print("   3. Is lighting good enough to see the person clearly?")
    print("   4. Is the person facing towards the camera?")
    
    # Edge detection to find objects
    edges = cv2.Canny(gray, 50, 150)
    edge_density = (edges > 0).sum() / edges.size * 100
    print(f"\n🔲 EDGE DENSITY: {edge_density:.1f}%")
    
    if edge_density < 5:
        print("   ⚠️  Very few edges - might be blank/uniform scene")
    elif edge_density > 30:
        print("   ✅ Many edges - objects/people likely present")
    
    # Save analysis
    analysis = {
        "timestamp": timestamp,
        "dimensions": {"width": width, "height": height},
        "brightness": float(brightness),
        "contrast": float(contrast),
        "sharpness": float(sharpness),
        "edge_density": float(edge_density),
        "diagnostics": {
            "lighting": "GOOD" if 100 <= brightness <= 200 else "CHECK",
            "contrast": "GOOD" if contrast > 20 else "CHECK",
            "sharpness": "GOOD" if sharpness > 100 else "CHECK",
            "has_objects": "LIKELY" if edge_density > 10 else "CHECK"
        }
    }
    
    json_path = TEST_DIR / f"diagnosis_{timestamp}.json"
    with open(json_path, "w") as f:
        json.dump(analysis, f, indent=2)
    
    print(f"\n💾 Analysis saved: {json_path}")
    
    # Save edge detection
    edge_path = TEST_DIR / f"diagnosis_edges_{timestamp}.jpg"
    cv2.imwrite(str(edge_path), edges)
    print(f"🔲 Edge map saved: {edge_path}")
    
    # Recommendations
    print("\n" + "="*80)
    print("💡 RECOMMENDATIONS")
    print("="*80)
    
    recommendations = []
    
    if brightness < 100:
        recommendations.append("❌ Frame is too dark - improve lighting")
    
    if contrast < 20:
        recommendations.append("❌ Low contrast - check background/clothing")
    
    if sharpness < 100:
        recommendations.append("❌ Image is blurry - check focus or reduce motion")
    
    if edge_density < 10:
        recommendations.append("❌ Very few objects detected - ensure person is in frame")
    
    if not recommendations:
        print("✅ Frame quality looks good!")
        print("   If model still returns empty predictions:")
        print("   - Try moving person closer to camera")
        print("   - Ensure person is fully visible")
        print("   - Try different angles/backgrounds")
    else:
        print("\n".join(recommendations))
    
    print("\n" + "="*80)
    print("\n📝 NEXT STEPS:")
    print("1. Check the saved frame_*.jpg - is person visible?")
    print("2. Check the edges_*.jpg - do you see person outline?")
    print("3. If person is visible in frame but edges show nothing,")
    print("   there may be a preprocessing issue")
    print("4. Run quick_test.py again after fixing any issues")

if __name__ == "__main__":
    analyze_frame()
