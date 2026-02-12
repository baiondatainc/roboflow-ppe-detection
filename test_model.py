#!/usr/bin/env python3
"""
PPE Detection Model Test & Validation Script
Tests the Roboflow model with camera frames and validates predictions
"""

import cv2
import requests
import json
import os
import base64
from datetime import datetime
from pathlib import Path
import numpy as np

# Configuration
ROBOFLOW_API_URL = "http://localhost:9001"  # Local inference server
# ROBOFLOW_API_URL = "https://detect.roboflow.com"  # Cloud API (backup)
ROBOFLOW_MODEL = os.getenv("ROBOFLOW_MODEL", "ppe-detection-soydn")
ROBOFLOW_VERSION = os.getenv("ROBOFLOW_VERSION", "1")
ROBOFLOW_API_KEY = os.getenv("ROBOFLOW_API_KEY", "")
CONFIDENCE = float(os.getenv("ROBOFLOW_CONFIDENCE", "0.4"))
OVERLAP = float(os.getenv("ROBOFLOW_OVERLAP", "0.3"))

# Test directories
TEST_DIR = Path("./test_output")
TEST_DIR.mkdir(exist_ok=True)
FRAMES_DIR = TEST_DIR / "frames"
FRAMES_DIR.mkdir(exist_ok=True)
RESULTS_DIR = TEST_DIR / "results"
RESULTS_DIR.mkdir(exist_ok=True)

class PPEModelTester:
    """Test and validate PPE detection model"""
    
    def __init__(self):
        self.test_results = {
            "total_frames": 0,
            "successful_predictions": 0,
            "failed_predictions": 0,
            "detections_by_class": {},
            "frames": []
        }
        self.class_colors = {
            "person": (255, 0, 0),        # Blue
            "hardhat": (0, 165, 255),     # Orange
            "helmet": (0, 165, 255),      # Orange
            "head": (0, 100, 255),        # Dark Orange
            "gloves": (0, 255, 0),        # Green
            "hand": (0, 200, 0),          # Dark Green
            "vest": (255, 255, 0),        # Cyan
            "safety_vest": (255, 255, 0), # Cyan
            "jacket": (200, 200, 0),      # Dark Cyan
            "glasses": (255, 0, 255),     # Magenta
            "no_hardhat": (0, 0, 255),    # Red
            "no_safety_vest": (0, 0, 255),# Red
            "no_gloves": (0, 0, 255)      # Red
        }
    
    def capture_webcam_frame(self, device=1, timeout=5):
        """Capture a frame from webcam"""
        print(f"\n📷 Capturing frame from /dev/video{device}...")
        
        try:
            cap = cv2.VideoCapture(device)
            if not cap.isOpened():
                print(f"❌ Cannot open video device /dev/video{device}")
                return None
            
            # Set resolution
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS, 30)
            
            # Warm up camera
            for _ in range(5):
                cap.read()
            
            # Capture frame
            ret, frame = cap.read()
            cap.release()
            
            if not ret:
                print("❌ Failed to capture frame")
                return None
            
            print(f"✅ Frame captured successfully: {frame.shape}")
            return frame
        
        except Exception as e:
            print(f"❌ Error capturing frame: {e}")
            return None
    
    def load_image_file(self, image_path):
        """Load image from file"""
        print(f"\n📂 Loading image from: {image_path}")
        
        try:
            frame = cv2.imread(str(image_path))
            if frame is None:
                print("❌ Failed to load image")
                return None
            
            print(f"✅ Image loaded successfully: {frame.shape}")
            return frame
        
        except Exception as e:
            print(f"❌ Error loading image: {e}")
            return None
    
    def save_frame(self, frame, label=""):
        """Save frame to disk"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"frame_{timestamp}_{label}.jpg"
        filepath = FRAMES_DIR / filename
        
        cv2.imwrite(str(filepath), frame)
        print(f"💾 Frame saved: {filepath}")
        return filepath
    
    def test_model_prediction(self, frame, use_local=True):
        """Test model prediction on a frame"""
        print(f"\n🎯 Testing model prediction...")
        
        try:
            # Encode frame to JPEG
            _, frame_bytes = cv2.imencode(".jpg", frame)
            
            if use_local:
                url = f"{ROBOFLOW_API_URL}/{ROBOFLOW_MODEL}/{ROBOFLOW_VERSION}"
                print(f"🌐 Using local inference server: {url}")
            else:
                url = f"https://detect.roboflow.com/{ROBOFLOW_MODEL}/{ROBOFLOW_VERSION}"
                print(f"🌐 Using cloud API: {url}")
            
            files = {
                "file": ("frame.jpg", frame_bytes.tobytes(), "image/jpeg")
            }
            
            params = {
                "api_key": ROBOFLOW_API_KEY,
                "confidence": CONFIDENCE,
                "overlap": OVERLAP
            }
            
            print(f"📤 Sending request with confidence={CONFIDENCE}, overlap={OVERLAP}")
            response = requests.post(url, files=files, params=params, timeout=30)
            
            if response.status_code != 200:
                print(f"❌ API Error {response.status_code}: {response.text}")
                return None
            
            predictions = response.json()
            print(f"✅ Prediction successful!")
            return predictions
        
        except requests.exceptions.ConnectionError:
            print("❌ Connection error - is the local server running on port 9001?")
            print("   Try: python -m roboflow.inference.server --port 9001")
            return None
        
        except Exception as e:
            print(f"❌ Error during prediction: {e}")
            return None
    
    def draw_predictions(self, frame, predictions):
        """Draw bounding boxes and labels on frame"""
        frame_with_boxes = frame.copy()
        
        if "predictions" not in predictions or not predictions["predictions"]:
            print("ℹ️  No predictions found")
            return frame_with_boxes
        
        preds = predictions["predictions"]
        print(f"\n🎨 Drawing {len(preds)} predictions...")
        
        for i, pred in enumerate(preds):
            # Extract prediction data
            x = int(pred.get("x", 0))
            y = int(pred.get("y", 0))
            width = int(pred.get("width", 0))
            height = int(pred.get("height", 0))
            confidence = pred.get("confidence", 0)
            class_name = pred.get("class", "Unknown")
            class_id = pred.get("class_id", -1)
            
            # Calculate bounding box coordinates
            x_min = max(0, x - width // 2)
            y_min = max(0, y - height // 2)
            x_max = min(frame.shape[1], x + width // 2)
            y_max = min(frame.shape[0], y + height // 2)
            
            # Get color for class
            color = self.class_colors.get(class_name.lower(), (200, 200, 200))
            
            # Draw bounding box
            cv2.rectangle(frame_with_boxes, (x_min, y_min), (x_max, y_max), color, 2)
            
            # Draw corner markers
            corner_size = 12
            cv2.rectangle(frame_with_boxes, (x_min, y_min), (x_min + corner_size, y_min + 3), color, -1)
            cv2.rectangle(frame_with_boxes, (x_min, y_min), (x_min + 3, y_min + corner_size), color, -1)
            
            cv2.rectangle(frame_with_boxes, (x_max - corner_size, y_min), (x_max, y_min + 3), color, -1)
            cv2.rectangle(frame_with_boxes, (x_max - 3, y_min), (x_max, y_min + corner_size), color, -1)
            
            cv2.rectangle(frame_with_boxes, (x_min, y_max - 3), (x_min + corner_size, y_max), color, -1)
            cv2.rectangle(frame_with_boxes, (x_min, y_max - corner_size), (x_min + 3, y_max), color, -1)
            
            cv2.rectangle(frame_with_boxes, (x_max - corner_size, y_max - 3), (x_max, y_max), color, -1)
            cv2.rectangle(frame_with_boxes, (x_max - 3, y_max - corner_size), (x_max, y_max), color, -1)
            
            # Draw label background
            label = f"{class_name.upper()}"
            conf_text = f"{confidence*100:.1f}%"
            
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.6
            thickness = 2
            
            label_size = cv2.getTextSize(label, font, font_scale, thickness)[0]
            conf_size = cv2.getTextSize(conf_text, font, font_scale, thickness)[0]
            
            label_height = label_size[1] + conf_size[1] + 10
            label_width = max(label_size[0], conf_size[0]) + 10
            
            # Label position (above or below box)
            label_y = y_min - label_height - 5 if y_min > label_height + 5 else y_max + label_height + 5
            label_x = x_min
            
            # Draw label background
            cv2.rectangle(frame_with_boxes, (label_x, label_y - label_height), 
                         (label_x + label_width, label_y), (0, 0, 0), -1)
            cv2.rectangle(frame_with_boxes, (label_x, label_y - label_height), 
                         (label_x + label_width, label_y), color, 2)
            
            # Draw text
            cv2.putText(frame_with_boxes, label, (label_x + 5, label_y - conf_size[1] - 5),
                       font, font_scale, color, thickness)
            cv2.putText(frame_with_boxes, conf_text, (label_x + 5, label_y - 5),
                       font, font_scale, (255, 255, 255), thickness)
            
            print(f"  [{i+1}] {class_name}: {confidence*100:.2f}% @ ({x}, {y}) size ({width}x{height})")
        
        return frame_with_boxes
    
    def validate_predictions(self, predictions):
        """Validate and analyze predictions"""
        print("\n" + "="*80)
        print("🔍 PREDICTION VALIDATION & ANALYSIS")
        print("="*80)
        
        if not predictions or "predictions" not in predictions:
            print("⚠️  No predictions found in response!")
            return {}
        
        preds = predictions["predictions"]
        analysis = {
            "total_detections": len(preds),
            "by_class": {},
            "persons": 0,
            "hardhat_helmet_head": 0,
            "gloves_hand": 0,
            "vest_jacket_safety": 0,
            "other": 0,
            "compliance": {
                "has_person": False,
                "has_protection": False,
                "is_compliant": False
            }
        }
        
        print(f"\n📊 TOTAL DETECTIONS: {len(preds)}")
        
        for pred in preds:
            class_name = pred.get("class", "Unknown")
            confidence = pred.get("confidence", 0)
            
            # Track by class
            if class_name not in analysis["by_class"]:
                analysis["by_class"][class_name] = {
                    "count": 0,
                    "confidences": [],
                    "detections": []
                }
            
            analysis["by_class"][class_name]["count"] += 1
            analysis["by_class"][class_name]["confidences"].append(confidence)
            analysis["by_class"][class_name]["detections"].append({
                "confidence": confidence,
                "position": (pred.get("x"), pred.get("y")),
                "size": (pred.get("width"), pred.get("height"))
            })
            
            # Categorize
            if class_name.lower() == "person":
                analysis["persons"] += 1
            elif any(x in class_name.lower() for x in ["hardhat", "helmet", "head"]):
                analysis["hardhat_helmet_head"] += 1
            elif any(x in class_name.lower() for x in ["glove", "hand"]):
                analysis["gloves_hand"] += 1
            elif any(x in class_name.lower() for x in ["vest", "jacket", "safety"]):
                analysis["vest_jacket_safety"] += 1
            else:
                analysis["other"] += 1
        
        # Print by class
        print("\n🏷️  DETECTIONS BY CLASS:")
        print("-" * 80)
        for class_name in sorted(analysis["by_class"].keys()):
            class_data = analysis["by_class"][class_name]
            count = class_data["count"]
            confidences = class_data["confidences"]
            avg_conf = np.mean(confidences) * 100
            min_conf = np.min(confidences) * 100
            max_conf = np.max(confidences) * 100
            
            print(f"\n🏷️  {class_name.upper()}")
            print(f"   ├─ Count: {count}")
            print(f"   ├─ Avg Confidence: {avg_conf:.2f}%")
            print(f"   ├─ Min Confidence: {min_conf:.2f}%")
            print(f"   └─ Max Confidence: {max_conf:.2f}%")
        
        # PPE Compliance Check
        print("\n👔 PPE COMPLIANCE CHECK:")
        print("-" * 80)
        
        analysis["compliance"]["has_person"] = analysis["persons"] > 0
        analysis["compliance"]["has_protection"] = (
            analysis["hardhat_helmet_head"] > 0 and
            analysis["gloves_hand"] > 0 and
            analysis["vest_jacket_safety"] > 0
        )
        analysis["compliance"]["is_compliant"] = (
            analysis["compliance"]["has_person"] and
            analysis["compliance"]["has_protection"]
        )
        
        print(f"   👥 Person Detected: {'✅ YES' if analysis['compliance']['has_person'] else '❌ NO'}")
        print(f"   🎩 Head Protection: {'✅ YES' if analysis['hardhat_helmet_head'] > 0 else '❌ NO'}")
        print(f"   🧤 Hand Protection: {'✅ YES' if analysis['gloves_hand'] > 0 else '❌ NO'}")
        print(f"   🦺 Body Protection: {'✅ YES' if analysis['vest_jacket_safety'] > 0 else '❌ NO'}")
        
        print(f"\n   STATUS: {'✅ COMPLIANT' if analysis['compliance']['is_compliant'] else '❌ NON-COMPLIANT'}")
        
        print("\n" + "="*80)
        
        return analysis
    
    def save_results(self, frame, frame_with_boxes, predictions, analysis, label=""):
        """Save test results"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save original frame
        orig_path = RESULTS_DIR / f"original_{timestamp}_{label}.jpg"
        cv2.imwrite(str(orig_path), frame)
        
        # Save annotated frame
        annotated_path = RESULTS_DIR / f"annotated_{timestamp}_{label}.jpg"
        cv2.imwrite(str(annotated_path), frame_with_boxes)
        
        # Save predictions JSON
        json_path = RESULTS_DIR / f"predictions_{timestamp}_{label}.json"
        with open(json_path, "w") as f:
            json.dump({
                "predictions": predictions.get("predictions", []),
                "analysis": analysis,
                "timestamp": timestamp
            }, f, indent=2)
        
        print(f"\n💾 RESULTS SAVED:")
        print(f"   ├─ Original: {orig_path}")
        print(f"   ├─ Annotated: {annotated_path}")
        print(f"   └─ Predictions: {json_path}")
        
        return {
            "original": orig_path,
            "annotated": annotated_path,
            "predictions": json_path
        }
    
    def run_full_test(self, source="webcam", device=1, label=""):
        """Run complete test workflow"""
        print("\n" + "="*80)
        print("🚀 PPE MODEL FULL TEST")
        print("="*80)
        
        # Capture or load frame
        if source == "webcam":
            frame = self.capture_webcam_frame(device)
        elif source == "file":
            frame = self.load_image_file(label)
        else:
            print(f"❌ Unknown source: {source}")
            return None
        
        if frame is None:
            return None
        
        # Save original frame
        self.save_frame(frame, label or source)
        
        # Get predictions
        predictions = self.test_model_prediction(frame, use_local=True)
        if predictions is None:
            return None
        
        # Validate predictions
        analysis = self.validate_predictions(predictions)
        
        # Draw predictions
        frame_with_boxes = self.draw_predictions(frame, predictions)
        
        # Save results
        saved = self.save_results(frame, frame_with_boxes, predictions, analysis, label or source)
        
        # Update test results
        self.test_results["total_frames"] += 1
        self.test_results["successful_predictions"] += 1
        self.test_results["frames"].append({
            "label": label or source,
            "total_detections": analysis.get("total_detections", 0),
            "analysis": analysis,
            "saved_files": saved
        })
        
        return {
            "frame": frame,
            "frame_with_boxes": frame_with_boxes,
            "predictions": predictions,
            "analysis": analysis,
            "saved": saved
        }


def main():
    """Main test routine"""
    tester = PPEModelTester()
    
    print("\n" + "="*80)
    print("🛡️  PPE DETECTION MODEL TEST & VALIDATION")
    print("="*80)
    print(f"Model: {ROBOFLOW_MODEL}/{ROBOFLOW_VERSION}")
    print(f"API Server: {ROBOFLOW_API_URL}")
    print(f"Confidence: {CONFIDENCE} | Overlap: {OVERLAP}")
    print(f"Test Directory: {TEST_DIR}")
    
    # Test 1: Webcam capture
    print("\n\n" + "="*80)
    print("TEST 1: WEBCAM CAPTURE & PREDICTION")
    print("="*80)
    result1 = tester.run_full_test(source="webcam", device=1, label="webcam_test")
    
    # Test 2: Another webcam frame
    print("\n\n" + "="*80)
    print("TEST 2: SECOND WEBCAM FRAME")
    print("="*80)
    result2 = tester.run_full_test(source="webcam", device=1, label="webcam_test_2")
    
    # Test 3: Existing test image (if available)
    test_images = list(Path(".").glob("test-frame*.jpg")) + list(Path(".").glob("frame.jpg"))
    if test_images:
        print("\n\n" + "="*80)
        print("TEST 3: EXISTING TEST IMAGE")
        print("="*80)
        result3 = tester.run_full_test(source="file", label=str(test_images[0]))
    
    # Summary
    print("\n\n" + "="*80)
    print("📋 TEST SUMMARY")
    print("="*80)
    print(f"Total Frames Tested: {tester.test_results['total_frames']}")
    print(f"Successful Predictions: {tester.test_results['successful_predictions']}")
    print(f"Failed Predictions: {tester.test_results['failed_predictions']}")
    
    print("\n✅ Tests completed! Check results in:", TEST_DIR)


if __name__ == "__main__":
    main()
