#!/bin/bash

# 🔍 Detection Display Testing Script
# Tests that person and hard hat detection are working correctly

echo "🧪 Detection Display Test Suite"
echo "================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if server is running
echo "Test 1️⃣  : Server Health"
echo "---"
SERVER_RESPONSE=$(curl -s http://localhost:3001/health)
if echo "$SERVER_RESPONSE" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ Server is running${NC}"
    echo "Response: $SERVER_RESPONSE"
else
    echo -e "${RED}❌ Server is not responding${NC}"
    echo "Start with: make webcam"
    exit 1
fi
echo ""

# Test 2: Check if webcam processing is active
echo "Test 2️⃣  : Webcam Processing Status"
echo "---"
STATUS=$(curl -s http://localhost:3001/api/status | grep -o '"isProcessingWebcam":[^,}]*')
if echo "$STATUS" | grep -q 'true'; then
    echo -e "${GREEN}✅ Webcam processing is active${NC}"
    echo "Status: $STATUS"
else
    echo -e "${YELLOW}⚠️  Webcam processing not active${NC}"
    echo "Start detection in UI: Click 'Start Detection' button"
fi
echo ""

# Test 3: Check frame dimensions
echo "Test 3️⃣  : Frame Dimensions"
echo "---"
FRAME_INFO=$(curl -s http://localhost:3001/health | grep -o '"frameWidth":[^,]*,"frameHeight":[^,}]*')
if echo "$FRAME_INFO" | grep -q 'frameWidth'; then
    echo -e "${GREEN}✅ Frame dimensions detected:${NC}"
    echo "$FRAME_INFO"
else
    echo -e "${YELLOW}⚠️  Frame dimensions not available yet${NC}"
fi
echo ""

# Test 4: Check for person detections in logs
echo "Test 4️⃣  : Recent Detections in Logs"
echo "---"
if [ -f "backend.log" ]; then
    echo "Last 5 detection entries from backend.log:"
    tail -20 backend.log | grep "Frame #" | tail -5 || echo "No frames processed yet"
    echo ""
else
    echo -e "${YELLOW}⚠️  No backend.log found yet${NC}"
fi
echo ""

# Test 5: Check WebSocket connection
echo "Test 5️⃣  : WebSocket Server"
echo "---"
if timeout 2 bash -c "echo > /dev/tcp/127.0.0.1/3001" 2>/dev/null; then
    echo -e "${GREEN}✅ WebSocket port is open${NC}"
else
    echo -e "${RED}❌ WebSocket port is not accessible${NC}"
fi
echo ""

# Test 6: Manual testing instructions
echo "Test 6️⃣  : Manual Testing Checklist"
echo "---"
echo "Before running these tests, make sure:"
echo "  1. Server is running: make webcam"
echo "  2. UI is open: http://localhost:5173"
echo "  3. You're on the 'Webcam' tab"
echo "  4. Click 'Start Detection' button"
echo ""

echo "🧑 PERSON DETECTION TEST:"
echo "  □ Stand in front of webcam"
echo "  □ Check PPE Status panel"
echo "  □ Should show: Person Detected ✓"
echo "  □ You should NOT see a blue box around your body (person boxes hidden)"
echo ""

echo "🎩 HARD HAT DETECTION TEST:"
echo "  □ Put on a hard hat / helmet / safety gear"
echo "  □ Check PPE Status panel"
echo "  □ Should show: Hard Hat / Helmet ✓ Present"
echo "  □ Should see an orange box on canvas (head detection)"
echo ""

echo "✗ HARD HAT REMOVAL TEST:"
echo "  □ Remove the hard hat"
echo "  □ Check PPE Status panel"
echo "  □ Should show: Hard Hat / Helmet ✗ MISSING"
echo "  □ Orange box should disappear from canvas"
echo ""

echo "⏱️  TIMEOUT TEST:"
echo "  □ Leave the frame (step away from camera)"
echo "  □ Wait 2 seconds"
echo "  □ PPE Status should reset to all items MISSING"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "If all tests pass and manual checks show correct behavior:"
echo -e "${GREEN}✅ Detection display is working correctly!${NC}"
echo ""
echo "If you see issues:"
echo -e "${YELLOW}⚠️  Common solutions:${NC}"
echo "  1. Person not showing:"
echo "     - Make sure you're in front of camera"
echo "     - Check PPE Status panel (not canvas)"
echo "     - Person boxes are intentionally hidden from canvas"
echo ""
echo "  2. Hard hat always showing Present:"
echo "     - Confidence threshold issue"
echo "     - Check 80% confidence filter in code"
echo "     - Restart server: make webcam"
echo ""
echo "  3. Detection freezes:"
echo "     - Kill any existing ffmpeg: pkill -f ffmpeg"
echo "     - Restart server: make webcam"
echo ""
echo "Reference docs:"
echo "  • FRONTEND_FIX_SUMMARY.md - Quick overview"
echo "  • FRONTEND_DETECTION_FIX.md - Detailed explanation"
echo "  • PERFORMANCE_CHECKLIST.md - Performance tips"
echo ""
