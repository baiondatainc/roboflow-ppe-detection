# PPE Detection System - Makefile Usage

## Quick Start

### Start Everything
```bash
make all
```

### Start Individual Services
```bash
# Backend only
make backend

# Frontend only
make frontend
```

## Available Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make backend` | Start backend server (port 3001) |
| `make frontend` | Start frontend UI (port 5173) |
| `make all` | Start backend + frontend together |
| `make install` | Install all dependencies |
| `make info` | Show system configuration |
| `make process-info` | Show processing pipeline information |
| `make clean` | Clean node_modules and logs |
| `make clean-logs` | Clear log files |
| `make test-api` | Test API endpoints |
| `make test-video` | Check video file exists |
| `make logs-backend` | Tail backend logs |
| `make logs-frontend` | Tail frontend logs |

## System Requirements

- **Node.js**: v20+ (installed)
- **npm**: 10+ (installed)
- **FFmpeg**: Required for video frame extraction (installed)

## Configuration

Edit `.env` file to configure:
```env
# Video file to process
VIDEO_FILE=./ppe-upload-video-new1.mp4

# Roboflow API settings
ROBOFLOW_API_KEY=your_api_key_here
ROBOFLOW_MODEL=safety/ppe-detection/1
ROBOFLOW_VERSION=2
ROBOFLOW_CONFIDENCE=0.5
```

## Typical Workflow

### 1. Check System Status
```bash
make info
```

### 2. View Processing Pipeline
```bash
make process-info
```

### 3. Start Services
```bash
make all
```

### 4. Open Dashboard
Navigate to http://localhost:5173

### 5. Process Video
- Go to "Live Stream" tab
- Click "Start FFmpeg Processing" button
- Watch video with PPE detections

### 6. Monitor Detections
- Check "Violations" tab for real-time alerts
- View bounding boxes on video canvas

## Logs

Backend and frontend logs are saved to:
- Backend: `/tmp/backend.log`
- Frontend: `/tmp/frontend.log`

View logs with:
```bash
make logs-backend
make logs-frontend
```

## API Endpoints

The backend provides these endpoints:

```
GET  /video              - Stream video file
GET  /health             - Health check
GET  /stats              - System statistics
POST /api/start-processing - Start FFmpeg processing
POST /api/stop-processing  - Stop FFmpeg processing
GET  /api/status         - Processing status
```

## WebSocket

Real-time detection messages are broadcast via WebSocket:
```
ws://localhost:3001
```

Message format:
```json
{
  "eventType": "PPE_VIOLATION",
  "personId": "Person-123",
  "type": "NO_HELMET",
  "label": "Missing Hard Hat",
  "confidence": 0.95,
  "timestamp": "2026-02-10T10:30:00Z",
  "boundingBox": {
    "x": 45.5,
    "y": 32.2,
    "width": 15.0,
    "height": 25.0
  }
}
```

## Troubleshooting

### FFmpeg not found
FFmpeg is required for video frame extraction. Install it with:
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg
```

### Video file not found
Make sure `ppe-upload-video-new1.mp4` exists in the project root, or update `VIDEO_FILE` in `.env`

### Backend won't start
Check port 3001 is not in use:
```bash
lsof -i :3001
```

### Frontend won't connect to backend
Ensure both are running and backend is on port 3001:
```bash
curl http://localhost:3001/health
```

## Clean Up

To remove dependencies and logs:
```bash
make clean
```

To only clear logs:
```bash
make clean-logs
```
