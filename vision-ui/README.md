# PPE Detection UI - Google Vertex Vision AI

A modern, real-time web application for monitoring PPE (Personal Protective Equipment) violations using Google Vertex Vision AI. Built with Vue 3, Vite, and WebSocket for live streaming of traffic violations.

## Overview

This UI application displays:
- **Live Traffic Stream**: Real-time video feed from the traffic-stream source
- **Violations Feed**: Real-time alerts of PPE violations detected by Google Vision AI
- **Dashboard**: Key metrics, statistics, and system health monitoring
- **System Status**: Connection status and performance metrics

## Features

✅ Real-time PPE violation detection and alerts  
✅ Live video stream viewer with connection status  
✅ Interactive violations dashboard with filtering  
✅ System metrics and analytics  
✅ Modern, responsive UI design  
✅ WebSocket real-time data updates  
✅ Google Cloud Pub/Sub integration  

## Project Setup

### Prerequisites

- Node.js 20.19.0 or >=22.12.0
- npm or yarn
- Backend server running on port 3001
- Google Cloud Vision AI stream configured

### Installation

```sh
cd vision-ui
npm install
```

### Development

```sh
npm run dev
```

The app will be available at `http://localhost:5173` (or the port shown in your terminal)

### Production Build

```sh
npm run build
```

This generates optimized files in the `dist` directory.

### Preview Production Build

```sh
npm run preview
```

## Project Structure

```
vision-ui/
├── public/              # Static assets
├── src/
│   ├── components/      # Vue components
│   │   ├── App.vue      # Main app shell with navigation
│   │   ├── Dashboard.vue    # Metrics and analytics dashboard
│   │   ├── StreamViewer.vue # Live video stream viewer
│   │   └── ViolationFeed.vue # Real-time violations list
│   ├── services/
│   │   └── socket.js    # WebSocket connection service
│   ├── styles/
│   │   └── global.css   # Global styles and utilities
│   ├── App.vue          # Root component
│   └── main.js          # Entry point
├── index.html           # HTML template
├── package.json         # Dependencies and scripts
└── vite.config.js       # Vite configuration
```

## Configuration

### WebSocket Connection

The application connects to the backend WebSocket server at `ws://localhost:3001`. To change this, edit `src/services/socket.js`:

```javascript
const socket = new WebSocket("ws://localhost:3001");
```

### Stream URL

The live stream viewer expects an MJPEG stream at `http://localhost:8080/stream`. To change this, edit the `streamUrl` in `src/components/StreamViewer.vue`:

```javascript
const streamUrl = ref("http://localhost:8080/stream");
```

## Backend Integration

The UI expects the backend server (server.js) to:

1. **Listen on port 3001** for WebSocket connections
2. **Subscribe to Pub/Sub topic** `visionai-ppe-sub`
3. **Broadcast violations** as JSON messages with this structure:

```json
{
  "eventType": "PPE_VIOLATION",
  "timestamp": "2024-02-10T12:00:00Z",
  "entity": {
    "personId": "person_123",
    "missing": ["hard_hat", "safety_vest"],
    "location": "Zone A"
  },
  "confidence": 0.95
}
```

## Dependencies

- **Vue 3.5.27**: Progressive JavaScript framework
- **Vite 7.3.1**: Next-generation build tool
- **Font Awesome 6.4.0**: Icon library (loaded via CDN)

## Browser Support

- Chrome/Edge/Brave (Latest)
- Firefox (Latest)
- Safari (Latest)

## Development Tips

### Hot Module Replacement

Changes to Vue components are automatically reflected in the browser without page reload during development.

### Vue DevTools

For debugging Vue state and components, install the Vue.js DevTools extension in your browser.

### Network Debugging

Use browser DevTools to monitor WebSocket messages and API calls to the backend.

## Troubleshooting

### Stream Not Displaying

1. Check that the stream endpoint is running at `http://localhost:8080/stream`
2. Verify CORS is enabled on the stream server
3. Check browser console for connection errors

### No Violations Appearing

1. Verify the backend server is running on port 3001
2. Check that the Pub/Sub subscription is receiving messages
3. Review browser console for WebSocket connection errors
4. Ensure violation events match the expected data structure

### Connection Warnings

- Yellow warning status: No violation updates in the last 10 seconds
- Red disconnected status: WebSocket connection has been lost

Ensure the backend is running and properly connected to the Pub/Sub topic.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
- Disable Vetur if installed
- Install [Vite](https://marketplace.visualstudio.com/items?itemName=antfu.vite) extension for best experience

## Customization

### Theme Colors

Modify the gradient colors in component files. The default palette uses:
- Primary: `#667eea` (Purple-Blue)
- Secondary: `#764ba2` (Deep Purple)
- Success: `#10b981` (Green)
- Warning: `#f59e0b` (Amber)
- Danger: `#ef4444` (Red)

Edit these in the `<style scoped>` sections of individual components.

### Component Styling

Each component uses scoped styles with a responsive design. Edit SCSS/CSS in the `<style scoped>` blocks within .vue files.

## Performance Optimization

- The violations feed automatically limits history to the last 100 items to maintain performance
- The dashboard metrics update every 3 seconds
- Stream connection uses exponential backoff for reconnection attempts
- All styles are scoped to prevent CSS conflicts

## License

Part of the Direct Vertex AI PPE Detection demonstration project.
