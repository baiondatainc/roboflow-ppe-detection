#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     CAMERA & PROCESS RESET SCRIPT FOR PPE DETECTION         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Step 1: Kill all related processes
echo -e "${BLUE}Step 1: Killing all related processes...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

pkill -9 -f "inference_service" 2>/dev/null && echo -e "${GREEN}✅ Killed inference_service${NC}" || true
pkill -9 -f "ffmpeg" 2>/dev/null && echo -e "${GREEN}✅ Killed ffmpeg${NC}" || true
pkill -9 -f "node server.js" 2>/dev/null && echo -e "${GREEN}✅ Killed node backend${NC}" || true
pkill -9 -f "npm run dev" 2>/dev/null && echo -e "${GREEN}✅ Killed npm frontend${NC}" || true

sleep 2

# Step 2: Check video devices
echo ""
echo -e "${BLUE}Step 2: Checking video devices...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -e /dev/video0 ] || [ -e /dev/video1 ]; then
    echo -e "${GREEN}✅ Video devices found:${NC}"
    ls -la /dev/video* 2>/dev/null
else
    echo -e "${RED}❌ No video devices found!${NC}"
    exit 1
fi

# Step 3: Test camera
echo ""
echo -e "${BLUE}Step 3: Testing camera capture...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DEVICE="/dev/video0"
if [ -e /dev/video1 ]; then
    DEVICE="/dev/video1"
fi

echo "Testing with $DEVICE..."

timeout 5 ffmpeg -f v4l2 -input_format yuyv422 -video_size 640x480 -framerate 30 \
    -i $DEVICE -vf fps=2 -f image2pipe -vcodec mjpeg -q:v 2 -frames:v 1 \
    /tmp/test_frame.jpg 2>&1 | grep -E "frame=|error" || true

if [ -f /tmp/test_frame.jpg ]; then
    SIZE=$(stat -c%s /tmp/test_frame.jpg 2>/dev/null || stat -f%z /tmp/test_frame.jpg 2>/dev/null)
    echo -e "${GREEN}✅ Camera working! Captured ${SIZE} bytes${NC}"
    rm -f /tmp/test_frame.jpg
else
    echo -e "${RED}❌ Failed to capture frame from camera${NC}"
    exit 1
fi

# Step 4: Verify no processes hold the device
echo ""
echo -e "${BLUE}Step 4: Verifying device is available...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PROCESSES=$(lsof /dev/video0 /dev/video1 2>/dev/null | grep -v "ffmpeg.*<defunct>" || true)
if [ -z "$PROCESSES" ]; then
    echo -e "${GREEN}✅ Video devices are free${NC}"
else
    echo -e "${YELLOW}⚠️  Processes using video devices:${NC}"
    echo "$PROCESSES"
fi

# Step 5: Summary
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ RESET COMPLETE${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Ready to start backend:${NC}"
echo "  make backend"
echo ""
echo -e "${YELLOW}Or start all services:${NC}"
echo "  make all"
echo ""
