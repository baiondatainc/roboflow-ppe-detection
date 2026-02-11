.PHONY: help backend frontend all install clean info process-info

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

# Configuration
VIDEO_FILE := ./ppe-upload-video-new1.mp4
BACKEND_PORT := 3001
FRONTEND_PORT := 5173

# ============================================================
# Help
# ============================================================
help:
	@echo "$(BLUE)╔════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║   PPE Detection System - Roboflow Video Streamer          ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(BLUE)Available targets:$(NC)"
	@echo ""
	@echo "  $(GREEN)make backend$(NC)       - Start backend server (port 3001)"
	@echo "  $(GREEN)make frontend$(NC)      - Start frontend UI (port 5173+)"
	@echo "  $(GREEN)make all$(NC)           - Start backend + frontend"
	@echo "  $(GREEN)make webcam$(NC)        - Start backend for webcam PPE detection"
	@echo "  $(GREEN)make kill$(NC)          - Kill all running processes"
	@echo "  $(GREEN)make install$(NC)       - Install all dependencies"
	@echo "  $(GREEN)make info$(NC)          - Show system info"
	@echo "  $(GREEN)make process-info$(NC)  - Show processing pipeline info"
	@echo "  $(GREEN)make clean$(NC)         - Clean node_modules and logs"
	@echo ""

# ============================================================
# Installation
# ============================================================
install: install-backend install-frontend
	@echo "$(GREEN)✅ All dependencies installed$(NC)"

install-backend:
	@if [ ! -d "node_modules" ]; then \
		echo "$(YELLOW)📦 Installing backend dependencies...$(NC)"; \
		npm install; \
	fi

install-frontend:
	@if [ ! -d "vision-ui/node_modules" ]; then \
		echo "$(YELLOW)📦 Installing frontend dependencies...$(NC)"; \
		cd vision-ui && npm install; \
	fi

# ============================================================
# Backend
# ============================================================
backend: install-backend
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "$(BLUE)Starting Backend (Roboflow + FFmpeg)...$(NC)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "$(GREEN)🚀 Backend running on port $(BACKEND_PORT)$(NC)"
	@echo "   🎬 Video stream : http://localhost:$(BACKEND_PORT)/video"
	@echo "   ❤️  Health       : http://localhost:$(BACKEND_PORT)/health"
	@echo "   🔌 WebSocket    : ws://localhost:$(BACKEND_PORT)"
	@echo "   📊 Stats        : http://localhost:$(BACKEND_PORT)/stats"
	@echo ""
	@echo "$(YELLOW)Processing Endpoints:$(NC)"
	@echo "   POST /api/start-processing"
	@echo "   POST /api/stop-processing"
	@echo "   GET  /api/status"
	@echo ""
	@node server.js

# ============================================================
# Frontend
# ============================================================
frontend: install-frontend
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "$(BLUE)Starting Frontend (Vue 3 + Vite)...$(NC)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "$(GREEN)🎨 Frontend running on port $(FRONTEND_PORT)$(NC)"
	@echo "   🌐 http://localhost:$(FRONTEND_PORT)"
	@echo ""
	@cd vision-ui && npm run dev

# ============================================================
# All Services
# ============================================================
all:
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "$(GREEN)🚀 Starting Backend + Frontend$(NC)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@$(MAKE) install
	@echo ""
	@echo "$(GREEN)Starting services in background...$(NC)"
	@echo ""
	@node server.js > /tmp/backend.log 2>&1 &
	@echo "$(GREEN)✅ Backend started (PID: $$!)$(NC)"
	@sleep 2
	@cd vision-ui && npm run dev > /tmp/frontend.log 2>&1 &
	@echo "$(GREEN)✅ Frontend started (PID: $$!)$(NC)"
	@echo ""
	@echo "$(GREEN)✅ Services started!$(NC)"
	@echo "$(BLUE)Open your browser:$(NC) http://localhost:$(FRONTEND_PORT)"
	@echo ""
	@echo "$(YELLOW)Next Steps:$(NC)"
	@echo "  1. Go to Live Stream tab"
	@echo "  2. Click 'Start FFmpeg Processing'"
	@echo "  3. Watch video with PPE detections"
	@echo ""
	@echo "$(YELLOW)View logs:$(NC)"
	@echo "  tail -f /tmp/backend.log"
	@echo "  tail -f /tmp/frontend.log"
	@echo ""

# ============================================================
# Information
# ============================================================
info:
	@echo "$(BLUE)═══════════════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)System Configuration$(NC)"
	@echo "$(BLUE)═══════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(GREEN)Video:$(NC)"
	@echo "   File: $(VIDEO_FILE)"
	@if [ -f "$(VIDEO_FILE)" ]; then \
		echo "   Status: $(GREEN)✅ Found$(NC)"; \
		echo "   Size: $$(ls -lh $(VIDEO_FILE) | awk '{print $$5}')"; \
	else \
		echo "   Status: $(RED)❌ Not found$(NC)"; \
	fi
	@echo ""
	@echo "$(GREEN)Environment:$(NC)"
	@echo "   Backend port: $(BACKEND_PORT)"
	@echo "   Frontend port: $(FRONTEND_PORT)"
	@echo ""
	@echo "$(GREEN)Node.js:$(NC)"
	@node --version
	@echo ""
	@echo "$(GREEN)npm:$(NC)"
	@npm --version
	@echo ""
	@if command -v ffmpeg >/dev/null 2>&1; then \
		echo "$(GREEN)FFmpeg:$(NC)"; \
		ffmpeg -version | head -n 1; \
	else \
		echo "$(RED)FFmpeg:$(NC) $(RED)Not installed$(NC)"; \
	fi
	@echo ""

process-info:
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "$(BLUE)Roboflow PPE Detection – How It Works$(NC)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "$(GREEN)Pipeline:$(NC)"
	@echo "  1️⃣  Backend extracts frames using FFmpeg (2 FPS)"
	@echo "  2️⃣  Frames sent to Roboflow PPE model API"
	@echo "  3️⃣  Detections received from Roboflow"
	@echo "  4️⃣  Broadcast to frontend via WebSocket"
	@echo "  5️⃣  Vue UI draws bounding boxes on video"
	@echo "  6️⃣  Real-time alerts in violations feed"
	@echo ""
	@echo "$(YELLOW)Required Configuration (.env):$(NC)"
	@echo "  ROBOFLOW_API_KEY=your_api_key_here"
	@echo "  ROBOFLOW_MODEL=safety/ppe-detection/1"
	@echo "  ROBOFLOW_VERSION=2"
	@echo "  VIDEO_FILE=$(VIDEO_FILE)"
	@echo ""
	@echo "$(YELLOW)API Endpoints:$(NC)"
	@echo "  GET  /video              - Stream video file"
	@echo "  GET  /health             - Health check"
	@echo "  GET  /stats              - System statistics"
	@echo "  POST /api/start-processing - Start FFmpeg processing"
	@echo "  POST /api/stop-processing  - Stop FFmpeg processing"
	@echo "  GET  /api/status         - Processing status"
	@echo ""
	@echo "$(YELLOW)WebSocket:$(NC)"
	@echo "  ws://localhost:$(BACKEND_PORT)"
	@echo "  Messages: PPE_VIOLATION, PROCESSING_COMPLETE"
	@echo ""

# ============================================================
# Cleanup
# ============================================================
clean:
	@echo "$(YELLOW)🧹 Cleaning up...$(NC)"
	@rm -rf node_modules
	@rm -rf vision-ui/node_modules
	@rm -f /tmp/backend.log
	@rm -f /tmp/frontend.log
	@echo "$(GREEN)✅ Cleanup complete$(NC)"

clean-logs:
	@rm -f /tmp/backend.log
	@rm -f /tmp/frontend.log
	@echo "$(GREEN)✅ Logs cleared$(NC)"

# ============================================================
# Development
# ============================================================
dev: backend

logs-backend:
	@tail -f /tmp/backend.log

logs-frontend:
	@tail -f /tmp/frontend.log

test-api:
	@echo "$(BLUE)Testing API endpoints...$(NC)"
	@curl -s http://localhost:$(BACKEND_PORT)/health | jq . || echo "Backend not running"

test-video:
	@echo "$(BLUE)Checking video file...$(NC)"
	@if [ -f "$(VIDEO_FILE)" ]; then \
		echo "$(GREEN)✅ Video file exists$(NC)"; \
		ls -lh $(VIDEO_FILE); \
	else \
		echo "$(RED)❌ Video file not found$(NC)"; \
	fi

kill:
	@echo "$(YELLOW)🔪 Killing all processes...$(NC)"
	@echo "   Stopping Node.js backend..."
	@pkill -f "node server.js" || true
	@echo "   Stopping Vite frontend..."
	@pkill -f "vite" || true
	@echo "   Stopping FFmpeg processes..."
	@pkill -f "ffmpeg.*video0" || true
	@pkill -f "npm run dev" || true
	@pkill -f ffmpeg || true
	@sleep 1
	@echo "$(GREEN)✅ All processes stopped$(NC)"
	@kill -9 $(lsof -t -i :8080) || true

webcam: install-backend
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "$(BLUE)Starting Backend for Webcam PPE Detection...$(NC)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "$(GREEN)🚀 Backend running on port $(BACKEND_PORT)$(NC)"
	@echo "   📷 Webcam stream: http://localhost:$(BACKEND_PORT)/webcam"
	@echo "   🔌 Start processing: POST http://localhost:$(BACKEND_PORT)/api/start-webcam-processing"
	@echo "   🛑 Stop processing: POST http://localhost:$(BACKEND_PORT)/api/stop-webcam-processing"
	@echo "   ❤️  Health check   : http://localhost:$(BACKEND_PORT)/health"
	@echo ""
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  1. Open frontend UI: http://localhost:5173 (or 5174+)"
	@echo "  2. Click on 'Webcam' tab"
	@echo "  3. Click 'Start Webcam' button"
	@echo "  4. Watch live PPE detections in real-time"
	@echo ""
	@node server.js

# ============================================================
# Default
# ============================================================
.DEFAULT_GOAL := help
