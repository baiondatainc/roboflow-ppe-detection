#!/bin/bash
# Webcam Feature Testing Script
# Test all new endpoints and WebSocket connections

set -e

API_URL="http://localhost:3001"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     ROBOFLOW PPE WEBCAM FEATURE TEST SUITE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Test 1: Health Check
echo -e "${BLUE}[TEST 1] Health Check${NC}"
echo "Endpoint: GET /health"
if response=$(curl -s "$API_URL/health"); then
    echo -e "Response: ${GREEN}✓${NC}"
    echo "$response" | jq '.'
else
    echo -e "Response: ${RED}✗ FAILED${NC}"
    exit 1
fi
echo ""

# Test 2: Get Status
echo -e "${BLUE}[TEST 2] Get Processing Status${NC}"
echo "Endpoint: GET /api/status"
if response=$(curl -s "$API_URL/api/status"); then
    echo -e "Response: ${GREEN}✓${NC}"
    echo "$response" | jq '.'
else
    echo -e "Response: ${RED}✗ FAILED${NC}"
    exit 1
fi
echo ""

# Test 3: Start Webcam Processing
echo -e "${BLUE}[TEST 3] Start Webcam Processing${NC}"
echo "Endpoint: POST /api/start-webcam-processing"
if response=$(curl -s -X POST "$API_URL/api/start-webcam-processing"); then
    echo -e "Response: ${GREEN}✓${NC}"
    echo "$response" | jq '.'
    echo ""
    echo "✓ Webcam processing should now be running"
    echo "  Check server logs for frame capture messages"
else
    echo -e "Response: ${RED}✗ FAILED${NC}"
    exit 1
fi
echo ""

# Wait for some frames to be processed
echo -e "${BLUE}[WAIT] Waiting 5 seconds for frame processing...${NC}"
sleep 5
echo ""

# Test 4: Check Status After Starting
echo -e "${BLUE}[TEST 4] Verify Status After Start${NC}"
echo "Endpoint: GET /api/status"
if response=$(curl -s "$API_URL/api/status"); then
    echo -e "Response: ${GREEN}✓${NC}"
    echo "$response" | jq '.'
    is_processing=$(echo "$response" | jq '.isProcessing')
    if [ "$is_processing" = "true" ]; then
        echo -e "${GREEN}✓ Processing is running${NC}"
    else
        echo -e "${RED}✗ Processing is not running${NC}"
    fi
else
    echo -e "Response: ${RED}✗ FAILED${NC}"
    exit 1
fi
echo ""

# Test 5: Stop Webcam Processing
echo -e "${BLUE}[TEST 5] Stop Webcam Processing${NC}"
echo "Endpoint: POST /api/stop-webcam-processing"
if response=$(curl -s -X POST "$API_URL/api/stop-webcam-processing"); then
    echo -e "Response: ${GREEN}✓${NC}"
    echo "$response" | jq '.'
    echo ""
    echo "✓ Webcam processing should now be stopped"
else
    echo -e "Response: ${RED}✗ FAILED${NC}"
    exit 1
fi
echo ""

# Test 6: Verify Status After Stopping
echo -e "${BLUE}[TEST 6] Verify Status After Stop${NC}"
echo "Endpoint: GET /api/status"
if response=$(curl -s "$API_URL/api/status"); then
    echo -e "Response: ${GREEN}✓${NC}"
    echo "$response" | jq '.'
    is_processing=$(echo "$response" | jq '.isProcessing')
    if [ "$is_processing" = "false" ]; then
        echo -e "${GREEN}✓ Processing is stopped${NC}"
    else
        echo -e "${YELLOW}⚠ Processing may still be running${NC}"
    fi
else
    echo -e "Response: ${RED}✗ FAILED${NC}"
    exit 1
fi
echo ""

# Test 7: Test MJPEG Stream Endpoint
echo -e "${BLUE}[TEST 7] Test MJPEG Stream Endpoint${NC}"
echo "Endpoint: GET /webcam"
echo "Note: MJPEG stream cannot be tested with curl directly"
echo "To test in browser: curl -I http://localhost:3001/webcam"
if curl -I -s "$API_URL/webcam" | head -1 | grep -q "200\|206"; then
    echo -e "Response: ${GREEN}✓ Stream endpoint available${NC}"
    curl -I -s "$API_URL/webcam" | head -5
else
    echo -e "Response: ${RED}✗ FAILED${NC}"
fi
echo ""

# Test 8: Debug Roboflow Connection
echo -e "${BLUE}[TEST 8] Test Roboflow API Connection${NC}"
echo "Endpoint: POST /debug/test-roboflow"
if response=$(curl -s -X POST "$API_URL/debug/test-roboflow"); then
    echo -e "Response: ${GREEN}✓${NC}"
    echo "$response" | jq '.' | head -20
else
    echo -e "Response: ${RED}✗ FAILED${NC}"
fi
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}TEST SUITE COMPLETED${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

echo "NEXT STEPS:"
echo "1. Check server logs for PPE detection messages"
echo "2. Open browser and navigate to Webcam tab"
echo "3. Click 'Start Webcam' and monitor detections"
echo "4. Check browser console (F12) for WebSocket messages"
echo ""
