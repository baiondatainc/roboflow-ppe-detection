"""
Video Analytics Service
Combines Vehicle Detection, Tracking, Speed Calculation, and License Plate Recognition

Features:
- YOLOv8 Vehicle Detection
- ByteTrack for multi-object tracking
- Speed calculation based on bounding box movement
- License Plate Recognition integration
- Real-time processing via WebSocket
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import os
from dotenv import load_dotenv
from datetime import datetime
import json
import requests
from pathlib import Path
import logging
import threading
import queue

# Import YOLOv8
from ultralytics import YOLO

# ByteTrack imports
try:
    from boxmot import BYTETracker
    BYTETRACK_AVAILABLE = True
except ImportError:
    BYTETRACK_AVAILABLE = False
    print("⚠️  ByteTrack not available. Install: pip install boxmot")

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# ==================== Configuration ====================
VIDEO_ANALYTICS_PORT = int(os.getenv('VIDEO_ANALYTICS_PORT', 5002))
PLATE_API_URL = os.getenv('VITE_PLATE_API_URL', 'http://localhost:5001')
PLATE_API_TOKEN = os.getenv('VITE_PLATE_API_TOKEN', '')

# Speed detection parameters
PIXELS_PER_METER = float(os.getenv('PIXELS_PER_METER', 10.0))  # Calibrate based on camera setup
FRAME_RATE = float(os.getenv('FRAME_RATE', 30.0))
MIN_SPEED_THRESHOLD = float(os.getenv('MIN_SPEED_THRESHOLD', 5.0))  # km/h

# Model paths
MODEL_DIR = Path('./models')
MODEL_DIR.mkdir(exist_ok=True)
YOLO_MODEL_PATH = str(MODEL_DIR / 'yolov8n.pt')  # nano model for speed
YOLO_CONF = float(os.getenv('YOLO_CONF', 0.45))

# ==================== Model Loading ====================

class ModelManager:
    """Manages YOLO and tracking models"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.yolo_model = None
        self.tracker = None
        self._load_models()
        self._initialized = True
    
    def _load_models(self):
        """Load YOLO and ByteTrack models"""
        try:
            logger.info("Loading YOLOv8 model...")
            self.yolo_model = YOLO(YOLO_MODEL_PATH)
            logger.info("✅ YOLOv8 loaded successfully")
            
            if BYTETRACK_AVAILABLE:
                logger.info("Initializing ByteTrack...")
                self.tracker = BYTETracker(track_thresh=0.5)
                logger.info("✅ ByteTrack initialized")
            else:
                logger.warning("ByteTrack not available - tracking disabled")
        except Exception as e:
            logger.error(f"Failed to load models: {e}")
            raise
    
    def detect(self, frame):
        """Run YOLO detection"""
        if self.yolo_model is None:
            return None
        
        results = self.yolo_model(frame, conf=YOLO_CONF, classes=[2, 5, 7])  # car, bus, truck
        return results[0]
    
    def get_tracker(self):
        """Get tracker instance"""
        return self.tracker


# ==================== Analytics Processors ====================

class SpeedCalculator:
    """Calculate vehicle speed from bounding box movement"""
    
    def __init__(self, pixels_per_meter=PIXELS_PER_METER, frame_rate=FRAME_RATE):
        self.pixels_per_meter = pixels_per_meter
        self.frame_rate = frame_rate
        self.track_history = {}  # track_id -> list of centroids
        self.max_history = 30  # frames to keep
    
    def update(self, detections, frame_shape):
        """
        Update tracker with new detections
        detections: list of [x1, y1, x2, y2, track_id, conf]
        """
        speeds = {}
        
        for det in detections:
            if len(det) < 6:
                continue
            
            x1, y1, x2, y2, track_id, conf = det[:6]
            track_id = int(track_id)
            
            # Calculate centroid
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            
            if track_id not in self.track_history:
                self.track_history[track_id] = []
            
            # Add to history
            self.track_history[track_id].append((cx, cy))
            
            # Keep only recent frames
            if len(self.track_history[track_id]) > self.max_history:
                self.track_history[track_id].pop(0)
            
            # Calculate speed if we have enough history
            if len(self.track_history[track_id]) > 10:
                old_cx, old_cy = self.track_history[track_id][0]
                curr_cx, curr_cy = self.track_history[track_id][-1]
                
                # Distance in pixels
                pixel_distance = np.sqrt((curr_cx - old_cx)**2 + (curr_cy - old_cy)**2)
                
                # Distance in meters
                meter_distance = pixel_distance / self.pixels_per_meter
                
                # Time in seconds
                frames_elapsed = len(self.track_history[track_id]) - 1
                time_elapsed = frames_elapsed / self.frame_rate
                
                # Speed in m/s and km/h
                if time_elapsed > 0:
                    speed_ms = meter_distance / time_elapsed
                    speed_kmh = speed_ms * 3.6
                    
                    speeds[track_id] = {
                        'speed_kmh': round(speed_kmh, 2),
                        'speed_ms': round(speed_ms, 2),
                        'is_speeding': speed_kmh > MIN_SPEED_THRESHOLD
                    }
            
            # Cleanup old tracks
            if track_id not in [d[4] for d in detections]:
                if track_id in self.track_history:
                    del self.track_history[track_id]
        
        return speeds


class LicensePlateDetector:
    """Interface to license plate recognition service"""
    
    def __init__(self, api_url=PLATE_API_URL):
        self.api_url = api_url
    
    def detect_plate(self, frame_roi):
        """
        Detect license plate in a region of interest
        frame_roi: numpy array of cropped image
        """
        try:
            if frame_roi.size == 0:
                return None
            
            # Encode image to bytes
            success, buffer = cv2.imencode('.jpg', frame_roi)
            if not success:
                return None
            
            image_bytes = buffer.tobytes()
            
            # Send to plate recognition service
            response = requests.post(
                f'{self.api_url}/api/detect-plate',
                data=image_bytes,
                headers={'Content-Type': 'application/octet-stream'},
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('results'):
                    return result
            
        except Exception as e:
            logger.warning(f"Plate detection error: {e}")
        
        return None


class VideoAnalytics:
    """Main analytics engine combining all components"""
    
    def __init__(self):
        self.models = ModelManager()
        self.speed_calc = SpeedCalculator()
        self.plate_detector = LicensePlateDetector()
        self.frame_count = 0
    
    def process_frame(self, frame):
        """
        Process a single frame
        Returns: detections with speed and plate info
        """
        self.frame_count += 1
        results = {
            'frame_id': self.frame_count,
            'vehicles': [],
            'timestamp': datetime.now().isoformat()
        }
        
        try:
            # Detect vehicles
            detection_result = self.models.detect(frame)
            if detection_result is None:
                return results
            
            # Extract boxes
            boxes = detection_result.boxes.xyxy.cpu().numpy()
            confs = detection_result.boxes.conf.cpu().numpy()
            
            if len(boxes) == 0:
                return results
            
            # Track vehicles
            if self.models.get_tracker():
                tracks = self.models.get_tracker().update(
                    np.hstack([boxes, confs.reshape(-1, 1)])
                )
                detections = tracks
            else:
                detections = np.hstack([boxes, np.zeros((len(boxes), 1)), confs.reshape(-1, 1)])
            
            # Calculate speeds
            speeds = self.speed_calc.update(detections, frame.shape)
            
            # Process each detection
            for det in detections:
                x1, y1, x2, y2 = det[:4]
                track_id = int(det[4]) if len(det) > 4 else -1
                conf = float(det[5]) if len(det) > 5 else 0
                
                vehicle = {
                    'id': track_id,
                    'bbox': {
                        'x1': float(x1),
                        'y1': float(y1),
                        'x2': float(x2),
                        'y2': float(y2)
                    },
                    'confidence': round(float(conf), 3),
                    'speed': speeds.get(track_id, None),
                    'plate': None
                }
                
                # Attempt plate detection on cropped region
                if track_id % 15 == 0 or track_id not in [v.get('id') for v in results['vehicles']]:
                    # Detect plate every 15 frames or for new vehicles
                    roi = frame[int(y1):int(y2), int(x1):int(x2)]
                    plate_result = self.plate_detector.detect_plate(roi)
                    if plate_result and plate_result.get('results'):
                        vehicle['plate'] = {
                            'number': plate_result['results'][0].get('plate', 'Unknown'),
                            'confidence': plate_result['results'][0].get('confidence', 0),
                            'region': plate_result['results'][0].get('region', {}).get('code', '')
                        }
                
                results['vehicles'].append(vehicle)
        
        except Exception as e:
            logger.error(f"Error processing frame: {e}")
            results['error'] = str(e)
        
        return results


# ==================== Flask Routes ====================

analytics_engine = None

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'video-analytics',
        'yolo_model': 'loaded' if analytics_engine and analytics_engine.models.yolo_model else 'not_loaded',
        'bytetrack': 'available' if BYTETRACK_AVAILABLE else 'not_available',
        'plate_service': 'available' if test_plate_service() else 'unavailable',
        'timestamp': datetime.now().isoformat()
    })

def test_plate_service():
    """Test if plate service is available"""
    try:
        response = requests.get(f'{PLATE_API_URL}/health', timeout=2)
        return response.status_code == 200
    except:
        return False

@app.route('/api/analyze-frame', methods=['POST'])
def analyze_frame():
    """
    Analyze a single frame for vehicles, speed, and plates
    Expects: Binary image data
    """
    global analytics_engine
    
    try:
        if analytics_engine is None:
            analytics_engine = VideoAnalytics()
        
        if not request.data:
            return jsonify({'success': False, 'error': 'No image data'}), 400
        
        # Decode image
        nparr = np.frombuffer(request.data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({'success': False, 'error': 'Invalid image'}), 400
        
        # Process frame
        results = analytics_engine.process_frame(frame)
        
        return jsonify({
            'success': True,
            'results': results
        })
    
    except Exception as e:
        logger.error(f"Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/analyze-video', methods=['POST'])
def analyze_video():
    """
    Analyze video file and return frame-by-frame results
    Expects: JSON with 'video_path' or binary video file
    """
    global analytics_engine
    
    try:
        if analytics_engine is None:
            analytics_engine = VideoAnalytics()
        
        # Get video path
        if request.is_json:
            data = request.get_json()
            video_path = data.get('video_path')
        else:
            return jsonify({'success': False, 'error': 'Expected JSON'}), 400
        
        if not video_path or not os.path.exists(video_path):
            return jsonify({'success': False, 'error': 'Video file not found'}), 404
        
        # Open video
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return jsonify({'success': False, 'error': 'Cannot open video'}), 400
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        frame_results = []
        frame_num = 0
        sample_rate = int(os.getenv('VIDEO_SAMPLE_RATE', 2))  # Process every nth frame
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_num += 1
            if frame_num % sample_rate != 0:
                continue
            
            # Process frame
            results = analytics_engine.process_frame(frame)
            frame_results.append(results)
        
        cap.release()
        
        return jsonify({
            'success': True,
            'video_info': {
                'total_frames': total_frames,
                'fps': fps,
                'processed_frames': len(frame_results)
            },
            'results': frame_results
        })
    
    except Exception as e:
        logger.error(f"Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get analytics configuration"""
    return jsonify({
        'pixels_per_meter': PIXELS_PER_METER,
        'frame_rate': FRAME_RATE,
        'min_speed_threshold': MIN_SPEED_THRESHOLD,
        'yolo_confidence': YOLO_CONF,
        'yolo_model': 'yolov8n (nano)',
        'tracker': 'ByteTrack' if BYTETRACK_AVAILABLE else 'None'
    })

@app.route('/api/calibrate-speed', methods=['POST'])
def calibrate_speed():
    """
    Calibrate speed detection
    Expects: JSON with 'real_distance_m' (real-world distance in meters) 
             and 'pixel_distance' (pixel distance in video)
    """
    try:
        data = request.get_json()
        real_distance = float(data.get('real_distance_m', 0))
        pixel_distance = float(data.get('pixel_distance', 0))
        
        if real_distance <= 0 or pixel_distance <= 0:
            return jsonify({'success': False, 'error': 'Invalid values'}), 400
        
        pixels_per_meter = pixel_distance / real_distance
        
        return jsonify({
            'success': True,
            'pixels_per_meter': pixels_per_meter,
            'message': f'Updated: {pixel_distance} pixels = {real_distance}m'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

if __name__ == '__main__':
    print("""
╔══════════════════════════════════════════════════════════════╗
║   🎥 VIDEO ANALYTICS SERVICE                                ║
║   Combined Speed Detection + License Plate Recognition       ║
╚══════════════════════════════════════════════════════════════╝
🚀 http://127.0.0.1:5002
🏗️  Architecture:
   YOLOv8 (Detection) → ByteTrack (Tracking) → Speed Calc
   ↓
   License Plate Recognition API
⚙️  Configure in .env:
   - PIXELS_PER_METER (calibration)
   - MIN_SPEED_THRESHOLD
   - YOLO_CONF
""")
    
    app.run(host='127.0.0.1', port=VIDEO_ANALYTICS_PORT, debug=False, threaded=True)
