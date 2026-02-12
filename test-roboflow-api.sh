#!/bin/bash

# API Test Script for Roboflow Detection
# Usage: bash test-roboflow-api.sh

echo "🧪 Testing Roboflow API Connection..."
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
    echo "✅ Loaded .env variables"
else
    echo "❌ .env file not found!"
    exit 1
fi

# Check required variables
if [ -z "$ROBOFLOW_API_KEY" ]; then
    echo "❌ ROBOFLOW_API_KEY not set!"
    exit 1
fi

if [ -z "$ROBOFLOW_MODEL" ]; then
    echo "❌ ROBOFLOW_MODEL not set!"
    exit 1
fi

if [ -z "$ROBOFLOW_VERSION" ]; then
    echo "❌ ROBOFLOW_VERSION not set!"
    exit 1
fi

echo "📋 Configuration:"
echo "  Model: $ROBOFLOW_MODEL"
echo "  Version: $ROBOFLOW_VERSION"
echo "  Confidence: ${ROBOFLOW_CONFIDENCE:-0.55}"
echo "  Overlap: ${ROBOFLOW_OVERLAP:-0.3}"
echo ""

# Check if test image exists
if [ ! -f "test-frame.jpg" ]; then
    echo "⚠️  test-frame.jpg not found, trying to create one..."
    if [ -f "frame.jpg" ]; then
        cp frame.jpg test-frame.jpg
        echo "✅ Created test-frame.jpg from frame.jpg"
    else
        echo "❌ No test image found!"
        exit 1
    fi
fi

echo "🔄 Sending test frame to Roboflow API..."
echo ""

# Make API request
RESPONSE=$(curl -s -X POST \
    -H "Content-Type: image/jpeg" \
    --data-binary @test-frame.jpg \
    "https://detect.roboflow.com/$ROBOFLOW_MODEL/$ROBOFLOW_VERSION?api_key=$ROBOFLOW_API_KEY&confidence=${ROBOFLOW_CONFIDENCE:-0.55}&overlap=${ROBOFLOW_OVERLAP:-0.3}&image_info=true")

echo "📨 Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "🔍 Parsing results..."

PREDICTIONS=$(echo "$RESPONSE" | jq '.predictions | length' 2>/dev/null)
if [ -z "$PREDICTIONS" ] || [ "$PREDICTIONS" = "null" ]; then
    echo "❌ Failed to parse response!"
    exit 1
fi

echo "✅ Predictions found: $PREDICTIONS"

# Show each prediction
if [ "$PREDICTIONS" -gt 0 ]; then
    echo ""
    echo "📊 Detections:"
    echo "$RESPONSE" | jq -r '.predictions[] | "  • \(.class) - Confidence: \(.confidence * 100 | floor)% [\(.x),\(.y),\(.width),\(.height)]"' 2>/dev/null
fi

echo ""
echo "✅ API test completed successfully!"
