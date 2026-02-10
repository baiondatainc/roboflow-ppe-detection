#!/bin/bash
# Test script for Roboflow PPE Detection Server

echo "==================================================="
echo "🔍 Testing Roboflow PPE Detection Server"
echo "==================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Server URL
SERVER="http://localhost:3001"

echo "1️⃣  Testing Server Health..."
HEALTH=$(curl -s "$SERVER/health")
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Server is running${NC}"
    echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH"
else
    echo -e "${RED}✗ Server is not responding${NC}"
    exit 1
fi
echo ""

echo "2️⃣  Testing Stats Endpoint..."
STATS=$(curl -s "$SERVER/stats")
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Stats endpoint OK${NC}"
    echo "$STATS" | jq . 2>/dev/null || echo "$STATS"
else
    echo -e "${RED}✗ Stats endpoint failed${NC}"
fi
echo ""

echo "3️⃣  Testing Processing Status..."
STATUS=$(curl -s "$SERVER/api/status")
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Status endpoint OK${NC}"
    echo "$STATUS" | jq . 2>/dev/null || echo "$STATUS"
else
    echo -e "${RED}✗ Status endpoint failed${NC}"
fi
echo ""

echo "4️⃣  Testing Roboflow Debug Endpoint..."
echo -e "${YELLOW}Sending POST request to /debug/test-roboflow...${NC}"
ROBOFLOW_TEST=$(curl -s -X POST "$SERVER/debug/test-roboflow" -w "\nHTTP_CODE:%{http_code}")
HTTP_CODE=$(echo "$ROBOFLOW_TEST" | grep "HTTP_CODE" | cut -d: -f2)
RESPONSE=$(echo "$ROBOFLOW_TEST" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ Roboflow test successful (HTTP $HTTP_CODE)${NC}"
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
else
    echo -e "${RED}✗ Roboflow test failed (HTTP $HTTP_CODE)${NC}"
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
fi
echo ""

echo "5️⃣  Checking Server Logs..."
echo -e "${YELLOW}Check your server console for detailed error messages${NC}"
echo ""

echo "==================================================="
echo "💡 Troubleshooting Tips:"
echo "==================================================="
echo "• Make sure FFmpeg is installed: ffmpeg -version"
echo "• Check if video file exists: ls -lh ppe-upload-video-new1.mp4"
echo "• Verify Roboflow API key is set in .env"
echo "• Check server console for error messages"
echo ""