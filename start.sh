#!/bin/bash

# ================= Colors =================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

clear

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   PPE Detection System - Roboflow Video Streamer (Local)   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ================= Sanity Check =================
if [ ! -f "server.js" ]; then
    echo -e "${RED}❌ Error: server.js not found!${NC}"
    echo "Run this script from the backend project root."
    exit 1
fi

# ================= Env =================
export VIDEO_FILE=./ppe-upload-video-new1.mp4

echo -e "${GREEN}✅ Environment configured${NC}"
echo "   VIDEO_FILE: $VIDEO_FILE"
echo ""

if [ ! -f "$VIDEO_FILE" ]; then
    echo -e "${YELLOW}⚠️  Video file not found: $VIDEO_FILE${NC}"
    echo "   Backend will run, but video streaming will fail."
    echo ""
fi

# ================= Backend =================
start_backend() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Starting Backend (Roboflow + FFmpeg)...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
        npm install || exit 1
    fi

    echo -e "${GREEN}🚀 Backend running on port 3001${NC}"
    echo "   🎬 Video stream : http://localhost:3001/video"
    echo "   ❤️ Health       : http://localhost:3001/health"
    echo "   🔌 WebSocket    : ws://localhost:3001"
    echo ""

    node server.js
}

# ================= Frontend =================
start_frontend() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Starting Frontend (Vue 3 UI)...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    cd vision-ui || exit 1

    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
        npm install || exit 1
    fi

    echo -e "${GREEN}🎨 Frontend running on port 5173${NC}"
    echo "   🌐 http://localhost:5173"
    echo ""

    npm run dev
}

# ================= Instructions =================
show_processing_info() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Roboflow PPE Detection – How It Works${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "1️⃣ Backend extracts frames using FFmpeg"
    echo "2️⃣ Frames sent to Roboflow PPE model"
    echo "3️⃣ Detections broadcast via WebSocket"
    echo "4️⃣ Vue UI draws bounding boxes + alerts"
    echo ""
    echo -e "${YELLOW}Required env vars:${NC}"
    echo "  ROBOFLOW_API_KEY=your_key_here"
    echo "  ROBOFLOW_MODEL=safety/ppe-detection/1"
    echo ""
}

# ================= Menu =================
show_menu() {
    echo -e "${BLUE}Select an option:${NC}"
    echo ""
    echo "  1) ${GREEN}Start Backend${NC}   (port 3001)"
    echo "  2) ${GREEN}Start Frontend${NC}  (port 5173)"
    echo "  3) ${GREEN}Processing Info${NC}"
    echo "  4) ${GREEN}Start ALL${NC}"
    echo "  5) ${RED}Exit${NC}"
    echo ""
}

# ================= CLI Args =================
case "$1" in
    all)
        echo -e "${GREEN}🚀 Starting Backend + Frontend${NC}"
        (start_backend) &
        sleep 2
        (start_frontend) &
        wait
        ;;
    backend)
        start_backend
        ;;
    frontend)
        start_frontend
        ;;
    help)
        show_processing_info
        ;;
    *)
        while true; do
            show_menu
            read -p "Enter choice [1-5]: " choice
            case $choice in
                1) start_backend; break ;;
                2) start_frontend; break ;;
                3) show_processing_info ;;
                4)
                    (start_backend) &
                    sleep 2
                    (start_frontend) &
                    break
                    ;;
                5)
                    echo -e "${GREEN}👋 Goodbye${NC}"
                    exit 0
                    ;;
                *)
                    echo -e "${RED}Invalid choice${NC}"
                    ;;
            esac
        done
        ;;
esac
