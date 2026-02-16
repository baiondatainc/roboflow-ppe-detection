#!/bin/bash

# 🎥 Video Analytics Model Setup Script
# Downloads and installs required models for video analytics

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🎥 VIDEO ANALYTICS - MODEL & DEPENDENCY SETUP                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Python installation
echo -e "${BLUE}[1/6]${NC} Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 not found!${NC}"
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
echo -e "${GREEN}✅ ${PYTHON_VERSION}${NC}"
echo ""

# Upgrade pip
echo -e "${BLUE}[2/6]${NC} Upgrading pip..."
python3 -m pip install --upgrade pip setuptools wheel -q
echo -e "${GREEN}✅ Pip upgraded${NC}"
echo ""

# Install Python dependencies
echo -e "${BLUE}[3/6]${NC} Installing Python dependencies from requirements.txt..."
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ requirements.txt not found!${NC}"
    exit 1
fi
echo ""

# Download YOLOv8 models
echo -e "${BLUE}[4/6]${NC} Downloading YOLOv8 models..."
mkdir -p models

echo -e "${YELLOW}📦 Downloading YOLOv8 Nano (3.2MB - fastest)...${NC}"
python3 << 'EOF'
from ultralytics import YOLO
import os
os.makedirs('./models', exist_ok=True)
model = YOLO('yolov8n.pt')
print("✅ YOLOv8 Nano downloaded")
EOF

echo ""
echo -e "${YELLOW}📦 Downloading YOLOv8 Small (22MB - balanced)...${NC}"
python3 << 'EOF'
from ultralytics import YOLO
import os
os.makedirs('./models', exist_ok=True)
model = YOLO('yolov8s.pt')
print("✅ YOLOv8 Small downloaded")
EOF

echo -e "${GREEN}✅ YOLOv8 models downloaded${NC}"
echo ""

# Verify ByteTrack installation
echo -e "${BLUE}[5/6]${NC} Verifying ByteTrack installation..."
python3 << 'EOF'
try:
    from boxmot import BYTETracker
    print("✅ ByteTrack is available")
except ImportError:
    print("⚠️  ByteTrack not available - tracking disabled (optional)")
    print("To enable: pip install boxmot")
EOF
echo ""

# Create model info
echo -e "${BLUE}[6/6]${NC} Creating model information file..."
python3 << 'EOF'
import json
from pathlib import Path
from ultralytics import YOLO

models_info = {
    "yolov8n": {
        "name": "YOLOv8 Nano",
        "size": "3.2 MB",
        "speed": "Fastest",
        "accuracy": "Good",
        "recommended": "Real-time processing",
        "path": "./models/yolov8n.pt"
    },
    "yolov8s": {
        "name": "YOLOv8 Small",
        "size": "22 MB",
        "speed": "Fast",
        "accuracy": "Better",
        "recommended": "Balanced performance",
        "path": "./models/yolov8s.pt"
    },
    "yolov8m": {
        "name": "YOLOv8 Medium",
        "size": "49 MB",
        "speed": "Medium",
        "accuracy": "High",
        "recommended": "Better accuracy needed",
        "path": "./models/yolov8m.pt"
    },
    "yolov8l": {
        "name": "YOLOv8 Large",
        "size": "94 MB",
        "speed": "Slower",
        "accuracy": "Highest",
        "recommended": "Maximum accuracy",
        "path": "./models/yolov8l.pt"
    }
}

with open('MODELS_INFO.json', 'w') as f:
    json.dump(models_info, f, indent=2)

print("✅ Model information saved to MODELS_INFO.json")
EOF
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo -e "${GREEN}✅ SETUP COMPLETE!${NC}"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1️⃣  Calibrate Speed Detection:"
echo "   • Edit .env file and set PIXELS_PER_METER based on your camera"
echo "   • See VIDEO_ANALYTICS_SETUP.md for calibration guide"
echo ""
echo "2️⃣  Start Services (in separate terminals):"
echo ""
echo "   Terminal 1 - Video Analytics:"
echo "   ${BLUE}python video_analytics_service.py${NC}"
echo ""
echo "   Terminal 2 - Frontend:"
echo "   ${BLUE}cd vision-ui && npm run dev${NC}"
echo ""
echo "3️⃣  Access Web Interface:"
echo "   ${BLUE}http://localhost:5173${NC}"
echo "   Navigate to 'Video Analytics' tab"
echo ""
echo "📚 Documentation:"
echo "   ${BLUE}VIDEO_ANALYTICS_SETUP.md${NC}"
echo ""
echo "🎯 Models Available:"
echo "   • yolov8n.pt (nano) - Already downloaded"
echo "   • yolov8s.pt (small) - Already downloaded"
echo "   • yolov8m.pt (medium) - Download with: python -c \"from ultralytics import YOLO; YOLO('yolov8m.pt')\""
echo "   • yolov8l.pt (large) - Download with: python -c \"from ultralytics import YOLO; YOLO('yolov8l.pt')\""
echo ""
echo "⚙️  Configuration:"
echo "   Edit .env file to adjust:"
echo "   • PIXELS_PER_METER (speed calibration)"
echo "   • FRAME_RATE (video fps)"
echo "   • MIN_SPEED_THRESHOLD (speeding threshold in km/h)"
echo "   • YOLO_CONF (detection confidence)"
echo ""
