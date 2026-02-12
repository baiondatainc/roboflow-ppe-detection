#!/usr/bin/env python3
"""
Local Model Inference Service for Person and Hard Hat Detection
Uses YOLOv8l for person detection and hardhat-best.pt for hard hat detection
"""

import cv2
import base64
from io import BytesIO
from PIL import Image
import numpy as np
from ultralytics import YOLO
import json
import sys
from pathlib import Path

# Load models
try:
    print("[INFO] Loading local models...", file=sys.stderr)
    
    # Person detection model (YOLOv8l)
    person_model = YOLO("models/yolov8l.pt")
    print("[✓] YOLOv8l loaded", file=sys.stderr)
    
    # Hard hat detection model
    hardhat_model = YOLO("models/hardhat-best.pt")
    print("[✓] Hardhat-best.pt loaded", file=sys.stderr)
    
except Exception as e:
    print(f"[ERROR] Failed to load models: {e}", file=sys.stderr)
    sys.exit(1)

def decode_image(image_data):
    """Decode image from base64"""
    try:
        if isinstance(image_data, str):
            image_data = image_data.encode('utf-8')
        
        # Handle base64 prefixes
        if b'base64,' in image_data:
            image_data = image_data.split(b'base64,')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except Exception as e:
        print(f"[ERROR] Image decode failed: {e}", file=sys.stderr)
        raise

def detect_persons(frame, conf_threshold=0.5):
    """Detect persons using YOLOv8l"""
    try:
        # Use minimum 0.5 confidence to avoid false positives
        min_conf = max(0.5, conf_threshold)
        results = person_model(frame, conf=min_conf, verbose=False)
        detections = []
        
        for result in results:
            for box in result.boxes:
                if result.names[int(box.cls)] == 'person':
                    x, y, w, h = box.xywh[0].tolist()
                    confidence = float(box.conf)
                    detections.append({
                        'class': 'person',
                        'x': x,
                        'y': y,
                        'width': w,
                        'height': h,
                        'confidence': confidence
                    })
        
        return detections
    except Exception as e:
        print(f"[ERROR] Person detection failed: {e}", file=sys.stderr)
        return []

def detect_hathats(frame, conf_threshold=0.5):
    """Detect hard hats using hardhat-best.pt"""
    try:
        # Use minimum 0.6 confidence for hard hats (stricter than person detection)
        min_conf = max(0.6, conf_threshold)
        results = hardhat_model(frame, conf=min_conf, verbose=False)
        detections = []
        
        for result in results:
            for box in result.boxes:
                class_name = result.names[int(box.cls)]
                x, y, w, h = box.xywh[0].tolist()
                confidence = float(box.conf)
                
                detections.append({
                    'class': class_name,  # Could be 'hardhat', 'helmet', etc.
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h,
                    'confidence': confidence
                })
        
        return detections
    except Exception as e:
        print(f"[ERROR] Hard hat detection failed: {e}", file=sys.stderr)
        return []

def process_frame(frame_data, conf_threshold=0.5):
    """Process frame with both models and return combined results"""
    try:
        # Decode image
        frame = decode_image(frame_data)
        h, w = frame.shape[:2]
        
        # Run detections
        person_detections = detect_persons(frame, conf_threshold)
        hardhat_detections = detect_hathats(frame, conf_threshold)
        
        # Combine results
        all_detections = person_detections + hardhat_detections
        
        return {
            'success': True,
            'frame_width': w,
            'frame_height': h,
            'detections': all_detections,
            'person_count': len(person_detections),
            'hardhat_count': len(hardhat_detections)
        }
    except Exception as e:
        print(f"[ERROR] Frame processing failed: {e}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e)
        }

def main():
    """Main entry point for processing frames from stdin"""
    print("[INFO] Local Inference Service Ready", file=sys.stderr)
    
    while True:
        try:
            # Read line from stdin (expects JSON with base64 image)
            line = input()
            if not line:
                continue
            
            data = json.loads(line)
            image_data = data.get('image')
            conf_threshold = data.get('confidence', 0.5)
            
            # Process frame
            result = process_frame(image_data, conf_threshold)
            
            # Send result to stdout
            print(json.dumps(result))
            sys.stdout.flush()
            
        except json.JSONDecodeError:
            print(json.dumps({'success': False, 'error': 'Invalid JSON'}))
        except KeyboardInterrupt:
            print("[INFO] Service stopped", file=sys.stderr)
            break
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))

if __name__ == '__main__':
    main()
