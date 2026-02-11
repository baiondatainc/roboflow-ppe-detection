#!/bin/bash

echo "🔍 Webcam Diagnostic Tool"
echo "=========================="
echo ""

# Check for video devices
echo "1️⃣  Checking for video devices..."
if ls /dev/video* 2>/dev/null; then
    echo "✅ Video devices found:"
    ls -l /dev/video*
else
    echo "❌ No video devices found"
fi
echo ""

# Check v4l2
echo "2️⃣  Checking v4l2 tools..."
if command -v v4l2-ctl &> /dev/null; then
    echo "✅ v4l2-ctl installed"
    echo ""
    echo "Available devices:"
    v4l2-ctl --list-devices
else
    echo "❌ v4l2-ctl not installed"
    echo "Install with: sudo apt install v4l-utils"
fi
echo ""

# Check USB cameras
echo "3️⃣  Checking USB cameras..."
echo "USB cameras detected:"
lsusb | grep -iE "camera|webcam|video" || echo "  None found"
echo ""

# Check kernel modules
echo "4️⃣  Checking kernel modules..."
echo "Video-related modules loaded:"
lsmod | grep -E "video|uvc" || echo "  None found"
echo ""

# Check permissions
echo "5️⃣  Checking permissions..."
if [ -e /dev/video0 ]; then
    echo "Device /dev/video0:"
    ls -l /dev/video0
    if groups | grep -q video; then
        echo "✅ User '$USER' is in video group"
    else
        echo "⚠️  User '$USER' NOT in video group"
        echo "Add with: sudo usermod -aG video $USER"
    fi
else
    echo "❌ /dev/video0 does not exist"
fi
echo ""

# Test with FFmpeg
echo "6️⃣  Testing with FFmpeg..."
if command -v ffmpeg &> /dev/null; then
    if [ -e /dev/video0 ]; then
        echo "Testing /dev/video0..."
        timeout 2 ffmpeg -f v4l2 -i /dev/video0 -frames:v 1 -f null - 2>&1 | grep -E "error|Stream|Video" || true
        if [ ${PIPESTATUS[0]} -eq 0 ] || [ ${PIPESTATUS[0]} -eq 124 ]; then
            echo "✅ FFmpeg can access webcam"
        else
            echo "❌ FFmpeg cannot access webcam"
        fi
    else
        echo "⚠️  Skipped - no /dev/video0"
    fi
else
    echo "❌ FFmpeg not installed"
    echo "Install with: sudo apt install ffmpeg"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SUMMARY & RECOMMENDATIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -e /dev/video0 ]; then
    echo "✅ Webcam device exists at /dev/video0"
    echo ""
    echo "Add to your .env file:"
    echo "  WEBCAM_DEVICE=/dev/video0"
elif ls /dev/video* 2>/dev/null | head -1 > /dev/null; then
    DEVICE=$(ls /dev/video* 2>/dev/null | head -1)
    echo "⚠️  Webcam found at: $DEVICE (not /dev/video0)"
    echo ""
    echo "Add to your .env file:"
    echo "  WEBCAM_DEVICE=$DEVICE"
else
    echo "❌ No webcam detected on this system"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check if webcam is physically connected"
    echo "2. Try different USB port"
    echo "3. Install drivers:"
    echo "   sudo apt install v4l-utils"
    echo "   sudo modprobe uvcvideo"
    echo "4. Reboot the system"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "💡 ALTERNATIVE: Use video file for testing"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Add to your .env file:"
    echo "  USE_VIDEO_FILE=true"
    echo "  VIDEO_SOURCE=./ppe-upload-video-new1.mp4"
    echo ""
    echo "This lets you test the PPE detection system"
    echo "with your existing video while fixing webcam!"
fi
echo ""