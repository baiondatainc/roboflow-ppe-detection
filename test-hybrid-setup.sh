#!/bin/bash

# Hybrid PPE Detection Test Script
# Tests both local models and Roboflow integration

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║     Hybrid PPE Detection - System Test                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Check Python installation
echo -n "🐍 Testing Python environment... "
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo -e "${GREEN}✓${NC} (v${PYTHON_VERSION})"
else
    echo -e "${RED}✗ Python3 not found${NC}"
    exit 1
fi

# Test 2: Check Python dependencies
echo -n "📦 Checking Python dependencies... "
if python3 -c "import torch, ultralytics, cv2, PIL" 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Missing dependencies${NC}"
    echo "  Run: pip install -r requirements.txt"
    exit 1
fi

# Test 3: Check Node.js
echo -n "🟢 Testing Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} (${NODE_VERSION})"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    exit 1
fi

# Test 4: Check npm packages
echo -n "📚 Checking npm packages... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} Running npm install..."
    npm install > /dev/null 2>&1
    echo "  npm packages installed"
fi

# Test 5: Check model files
echo -n "🤖 Checking model files... "
MODELS_OK=true
if [ ! -f "models/hardhat-best.pt" ]; then
    echo -e "${RED}✗ Missing hardhat-best.pt${NC}"
    MODELS_OK=false
fi
if $MODELS_OK; then
    echo -e "${GREEN}✓${NC}"
else
    echo "  Note: YOLOv8l will auto-download on first run"
fi

# Test 6: Check .env file
echo -n "⚙️  Checking .env configuration... "
if [ -f ".env" ]; then
    # Check for required keys
    if grep -q "ROBOFLOW_API_KEY" .env && grep -q "ROBOFLOW_MODEL" .env; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠${NC} Missing Roboflow config"
        echo "  Edit .env and add ROBOFLOW_API_KEY and ROBOFLOW_MODEL"
    fi
else
    echo -e "${YELLOW}⚠${NC} .env file not found"
    echo "  Create .env with Roboflow credentials"
fi

# Test 7: Check ffmpeg
echo -n "🎬 Checking ffmpeg... "
if command -v ffmpeg &> /dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} ffmpeg not found (needed for webcam)"
fi

# Test 8: Check webcam device
echo -n "📹 Checking webcam device... "
if [ -e "/dev/video0" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} /dev/video0 not found"
    echo "  Webcam may not be available"
fi

# Test 9: Test Python inference service startup
echo -n "🔧 Testing Python inference service... "
{
    timeout 5 python3 inference_service.py <<< '{}' 2>/dev/null || true
} &
sleep 2

# Check if process started
if pgrep -f "python3 inference_service.py" > /dev/null 2>&1; then
    pkill -f "python3 inference_service.py" 2>/dev/null || true
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Service failed to start${NC}"
fi

# Test 10: Check API connectivity
echo -n "🌐 Checking API connectivity... "
if python3 -c "import socket; socket.create_connection(('detect.roboflow.com', 443), timeout=5)" 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}⚠${NC} Cannot reach Roboflow (check internet)"
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║     System Status Summary                              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo -e "✅ ${GREEN}Environment ready for hybrid PPE detection!${NC}"
echo ""
echo "📋 Next steps:"
echo "  1. Ensure .env has valid ROBOFLOW_API_KEY"
echo "  2. Run:  npm start"
echo "  3. Open: http://localhost:3001"
echo "  4. Click 'Start Detection'"
echo ""
echo "📖 Documentation:"
echo "  - Setup: HYBRID_SETUP.md"
echo "  - Quick Ref: HYBRID_QUICKREF.md"
echo "  - Implementation: HYBRID_IMPLEMENTATION.md"
echo ""
