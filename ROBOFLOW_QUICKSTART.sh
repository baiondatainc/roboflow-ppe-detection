#!/bin/bash

# 🛡️ Roboflow PPE Detection System - Quick Start Script
# This script sets up and runs the PPE detection system

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     🛡️  ROBOFLOW PPE DETECTION SYSTEM - SETUP            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js version
echo "✅ Checking Node.js version..."
NODE_VERSION=$(node -v)
echo "   Found: $NODE_VERSION"
echo ""

# Check if video file exists
echo "✅ Checking video file..."
if [ -f "fixed_street_vehicles_people.mp4" ]; then
    echo "   ✓ fixed_street_vehicles_people.mp4 found"
    ls -lh fixed_street_vehicles_people.mp4
else
    echo "   ⚠️  Video file not found!"
    echo "   Please ensure fixed_street_vehicles_people.mp4 is in the root directory"
    exit 1
fi
echo ""

# Install backend dependencies
echo "📦 Installing backend dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    echo "   ✓ Backend dependencies installed"
else
    echo "   ✓ Backend dependencies already installed"
fi
echo ""

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd vision-ui
if [ ! -d "node_modules" ]; then
    npm install
    echo "   ✓ Frontend dependencies installed"
else
    echo "   ✓ Frontend dependencies already installed"
fi
cd ..
echo ""

# Create .env file if it doesn't exist
echo "⚙️  Configuring environment..."
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
PORT=3001
VIDEO_FILE=./fixed_street_vehicles_people.mp4
ROBOFLOW_API_KEY=YOUR_API_KEY
ROBOFLOW_MODEL=ppe-4-zrtqx
ROBOFLOW_VERSION=2
EOF
    echo "   ✓ Created .env file with default settings"
    echo "   ⚠️  Remember to set ROBOFLOW_API_KEY for Roboflow integration"
else
    echo "   ✓ .env file already exists"
fi
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║              🚀 READY TO START                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "To start the system:"
echo ""
echo "  1️⃣  Terminal 1 - Start Backend Server:"
echo "      npm start"
echo ""
echo "  2️⃣  Terminal 2 - Start Frontend Development Server:"
echo "      cd vision-ui && npm run dev"
echo ""
echo "  3️⃣  Open Browser:"
echo "      http://localhost:3001"
echo ""
echo "📚 For more information, see:"
echo "   • ROBOFLOW_SETUP.md - Full setup and configuration guide"
echo "   • README.md - Project overview"
echo ""
echo "🧪 To test without Roboflow API key:"
echo "   curl http://localhost:3001/debug/simulate-ppe"
echo ""
