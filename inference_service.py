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
    
    # Combined detection model (person + PPE)
    model = YOLO("models/best.pt")
    print("[✓] best.pt loaded", file=sys.stderr)
    
    print("[✓] Models ready for inference", file=sys.stderr)
    sys.stderr.flush()
    
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

def detect_objects(frame, conf_threshold=0.5):
    """Detect all objects using best.pt"""
    try:
        results = model(frame, conf=conf_threshold, verbose=False)
        detections = []
        
        for result in results:
            for box in result.boxes:
                class_name = result.names[int(box.cls)]
                x, y, w, h = box.xywh[0].tolist()
                confidence = float(box.conf)
                
                detections.append({
                    'class': class_name,
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h,
                    'confidence': confidence
                })
        
        return detections
    except Exception as e:
        print(f"[ERROR] Detection failed: {e}", file=sys.stderr)
        return []
def process_frame(frame_data, conf_threshold=0.5):
    """Process frame with best.pt model and return detections"""
    try:
        # Decode image
        frame = decode_image(frame_data)
        h, w = frame.shape[:2]
        
        # Run detections with single model
        detections = detect_objects(frame, conf_threshold)
        
        return {    
            'success': True,
            'frame_width': w,
            'frame_height': h,
            'detections': detections,
            'detection_count': len(detections)
        }   
    except Exception as e:
        print(f"[ERROR] Frame processing failed: {e}", file=sys.stderr)
        return {
            'success': False,
            'error': str(e)
        }

def main():
    """Main entry point for processing frames from stdin"""
    print("[✓] Local Inference Service Ready", file=sys.stderr)
    sys.stderr.flush()
    
    while True:
        try:
            line = input()
            if not line:
                continue
            
            data = json.loads(line)
            image_data = data.get('image')
            conf_threshold = data.get('confidence', 0.5)
            
            result = process_frame(image_data, conf_threshold)
            
            print(json.dumps(result))
            sys.stdout.flush()
            
        except json.JSONDecodeError:
            print(json.dumps({'success': False, 'error': 'Invalid JSON'}))
            sys.stdout.flush()
        except KeyboardInterrupt:
            print("[INFO] Service stopped", file=sys.stderr)
            break
        except Exception as e:
            print(json.dumps({'success': False, 'error': str(e)}))
            sys.stdout.flush()

if __name__ == '__main__':
    main()
