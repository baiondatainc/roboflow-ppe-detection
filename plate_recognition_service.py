"""
License Plate Recognition Service
Uses PlateRecognizer API for license plate detection and recognition
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from PIL import Image
import io
import base64
import os
from dotenv import load_dotenv
import json
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
PLATE_API_TOKEN = os.getenv('VITE_PLATE_API_TOKEN', 'sk_test_your_token_here')
PLATE_API_URL = 'https://api.platerecognizer.com/v1/plate-reader/'
PLATE_API_REGIONS = ['sa', 'ae', 'ksa']  # KSA/Saudi Arabia, UAE regions
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Service logging
def log(message, level='INFO'):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {level}: {message}")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'plate-recognition',
        'api_configured': bool(PLATE_API_TOKEN and PLATE_API_TOKEN != 'sk_test_your_token_here'),
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/detect-plate', methods=['POST'])
def detect_plate():
    """
    Detect license plates in an image
    Expects: Binary image data (application/octet-stream)
    Returns: Plate recognition results with bounding boxes and vehicle details
    """
    try:
        # Validate image data
        if not request.data:
            log("No image data provided", "ERROR")
            return jsonify({
                'success': False,
                'error': 'No image data provided'
            }), 400

        image_data = request.data
        
        # Validate file size
        if len(image_data) > MAX_FILE_SIZE:
            log(f"File too large: {len(image_data)} bytes", "ERROR")
            return jsonify({
                'success': False,
                'error': 'File size must be less than 50MB'
            }), 400

        # Validate image
        try:
            image = Image.open(io.BytesIO(image_data))
            image_width, image_height = image.size
            log(f"Processing image: {image_width}x{image_height}")
        except Exception as e:
            log(f"Invalid image format: {str(e)}", "ERROR")
            return jsonify({
                'success': False,
                'error': f'Invalid image format: {str(e)}'
            }), 400

        # Check API token
        if not PLATE_API_TOKEN or PLATE_API_TOKEN == 'sk_test_your_token_here':
            log("Plate Recognizer API token not configured, returning demo response", "WARN")
            return jsonify({
                'success': True,
                'demo_mode': True,
                'message': 'API token not configured - showing demo response',
                'results': [],
                'processing_time': 0,
                'image_width': image_width,
                'image_height': image_height,
                'timestamp': datetime.now().isoformat()
            })

        # Send to Plate Recognizer API
        log("Sending image to Plate Recognizer API...")
        
        files = {'upload': image_data}
        headers = {'Authorization': f'Token {PLATE_API_TOKEN}'}
        params = {'regions': PLATE_API_REGIONS}

        response = requests.post(
            PLATE_API_URL,
            files=files,
            headers=headers,
            params=params,
            timeout=30
        )

        # Accept both 200 and 201 as success (201 = Created, 200 = OK)
        if response.status_code not in [200, 201]:
            log(f"API Error: {response.status_code}", "ERROR")
            return jsonify({
                'success': False,
                'error': f'Plate recognition API error: {response.status_code}',
                'api_message': response.text[:200]
            }), 400  # Return 400 to client instead of passing through status code

        result = response.json()
        
        plate_count = len(result.get('results', []))
        log(f"Detection complete: {plate_count} plates found")

        return jsonify({
            'success': True,
            'results': result.get('results', []),
            'processing_time': result.get('processing_time', 0),
            'image_width': image_width,
            'image_height': image_height,
            'timestamp': result.get('timestamp', datetime.now().isoformat()),
            'version': result.get('version', 1)
        })

    except requests.exceptions.Timeout:
        log("API request timeout", "ERROR")
        return jsonify({
            'success': False,
            'error': 'API request timeout'
        }), 504
    except requests.exceptions.RequestException as e:
        log(f"API request failed: {str(e)}", "ERROR")
        return jsonify({
            'success': False,
            'error': f'API request failed: {str(e)}'
        }), 500
    except Exception as e:
        log(f"Unexpected error: {str(e)}", "ERROR")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/detect-plate-base64', methods=['POST'])
def detect_plate_base64():
    """
    Detect license plates from base64 encoded image
    Expects: JSON with base64 encoded image
    """
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            log("No base64 image data provided", "ERROR")
            return jsonify({
                'success': False,
                'error': 'No image data provided'
            }), 400

        # Decode base64 image
        base64_image = data['image']
        if base64_image.startswith('data:image'):
            base64_image = base64_image.split(',')[1]

        try:
            image_data = base64.b64decode(base64_image)
        except Exception as e:
            log(f"Base64 decode error: {str(e)}", "ERROR")
            return jsonify({
                'success': False,
                'error': f'Invalid base64 image: {str(e)}'
            }), 400

        # Forward to detect_plate
        request.data = image_data
        return detect_plate()

    except Exception as e:
        log(f"Base64 processing error: {str(e)}", "ERROR")
        return jsonify({
            'success': False,
            'error': f'Processing error: {str(e)}'
        }), 400

if __name__ == '__main__':
    print("""
╔══════════════════════════════════════════════════════════════╗
║   🚗 LICENSE PLATE RECOGNITION SERVICE                       ║
╚══════════════════════════════════════════════════════════════╝
🚀 http://127.0.0.1:5001
📝 Plate Recognizer API: https://platerecognizer.com
⚙️  Regions: KSA, UAE
📖 Configure token in .env file: VITE_PLATE_API_TOKEN
""")
    
    if PLATE_API_TOKEN == 'sk_test_your_token_here':
        print("⚠️  WARNING: Using default API token. Configure VITE_PLATE_API_TOKEN in .env\n")
    
    app.run(host='127.0.0.1', port=5001, debug=False, threaded=True)
