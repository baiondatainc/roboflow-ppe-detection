#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         WEBCAM DIAGNOSTIC TOOL FOR PPE SYSTEM               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root (needed for some checks)
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  Running as root - this is OK but not required"
fi

echo "1️⃣  Checking camera device..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -e /dev/video1 ]; then
    echo "✅ /dev/video1 exists"
    ls -l /dev/video1
else
    echo "❌ /dev/video1 NOT FOUND"
    echo "   Your camera device might be at a different location"
    echo "   Try: ls /dev/video*"
    ls /dev/video* 2>/dev/null || echo "   No video devices found!"
    exit 1
fi

echo ""
echo "2️⃣  Checking v4l2 utilities..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v v4l2-ctl &> /dev/null; then
    echo "✅ v4l2-ctl is installed"
    
    echo ""
    echo "📹 Camera information:"
    v4l2-ctl --list-devices
    
    echo ""
    echo "📐 Supported formats for /dev/video1:"
    v4l2-ctl -d /dev/video1 --list-formats-ext | head -30
else
    echo "❌ v4l2-ctl not installed"
    echo "   Install with: sudo apt-get install v4l-utils"
fi

echo ""
echo "3️⃣  Checking if camera is in use..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v lsof &> /dev/null; then
    PROCESSES=$(lsof /dev/video1 2>/dev/null)
    if [ -n "$PROCESSES" ]; then
        echo "⚠️  /dev/video1 is currently in use by:"
        echo "$PROCESSES"
        echo ""
        echo "   To kill these processes, run:"
        echo "   pkill -f 'ffmpeg.*video1'"
        echo "   or"
        echo "   fuser -k /dev/video1"
    else
        echo "✅ /dev/video1 is available (not in use)"
    fi
else
    echo "⚠️  lsof not installed, can't check if device is in use"
    echo "   Install with: sudo apt-get install lsof"
fi

echo ""
echo "4️⃣  Checking FFmpeg..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v ffmpeg &> /dev/null; then
    echo "✅ FFmpeg is installed"
    ffmpeg -version | head -1
    
    echo ""
    echo "📹 FFmpeg can see these video devices:"
    ffmpeg -f v4l2 -list_formats all -i /dev/video1 2>&1 | grep -E "video|Compressed|Raw"
else
    echo "❌ FFmpeg not installed"
    echo "   Install with: sudo apt-get install ffmpeg"
    exit 1
fi

echo ""
echo "5️⃣  Testing camera capture..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Attempting to capture 1 frame from camera..."
echo "(This will timeout after 5 seconds if it fails)"

timeout 5 ffmpeg -f v4l2 -i /dev/video1 \
    -vf "fps=1,scale=640:480" \
    -f image2pipe \
    -vcodec mjpeg \
    -q:v 3 \
    -frames:v 1 \
    /tmp/test_frame.jpg 2>&1 | tail -20

if [ -f /tmp/test_frame.jpg ]; then
    SIZE=$(stat -f%z /tmp/test_frame.jpg 2>/dev/null || stat -c%s /tmp/test_frame.jpg 2>/dev/null)
    echo ""
    echo "✅ SUCCESS! Captured frame: /tmp/test_frame.jpg (${SIZE} bytes)"
    echo "   Your camera is working with these FFmpeg settings"
    rm /tmp/test_frame.jpg
else
    echo ""
    echo "❌ FAILED to capture frame"
    echo ""
    echo "   Possible issues:"
    echo "   1. Camera format not supported"
    echo "   2. Camera is busy/in use"
    echo "   3. Permission issues"
    echo "   4. Hardware problem"
fi

echo ""
echo "6️⃣  Recommended FFmpeg command for your system..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Based on diagnostics, use this FFmpeg command:"
echo ""
echo "ffmpeg -f v4l2 -i /dev/video1 \\"
echo "       -vf fps=10,scale=640:480 \\"
echo "       -f image2pipe \\"
echo "       -vcodec mjpeg \\"
echo "       -q:v 3 \\"
echo "       pipe:1"

echo ""
echo "7️⃣  Alternative formats to try if default fails..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Try #1 (Explicit pixel format - YUYV422):"
echo "ffmpeg -f v4l2 -input_format yuyv422 -video_size 640x480 -i /dev/video1 \\"
echo "       -vf fps=10 -f image2pipe -vcodec mjpeg -q:v 3 pipe:1"

echo ""
echo "Try #2 (Auto-detect format):"
echo "ffmpeg -f v4l2 -i /dev/video1 \\"
echo "       -vf fps=10,scale=640:480 -f image2pipe -vcodec mjpeg -q:v 3 pipe:1"

echo ""
echo "Try #3 (Raw pixel format):"
echo "ffmpeg -f v4l2 -pixel_format yuyv422 -video_size 640x480 -i /dev/video1 \\"
echo "       -vf fps=10 -f image2pipe -vcodec mjpeg -q:v 3 pipe:1"

echo ""
echo "Try #4 (MJPEG native if supported):"
echo "ffmpeg -f v4l2 -input_format mjpeg -video_size 640x480 -i /dev/video1 \\"
echo "       -vf fps=10 -f image2pipe -vcodec copy pipe:1"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "DIAGNOSTIC COMPLETE"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. If test capture succeeded → Your camera works!"
echo "2. If camera is in use → Kill the process using it"
echo "3. If format issues → Try alternative FFmpeg commands above"
echo "4. Update server_ffmpeg_fixed.js with working command"
echo ""