#!/bin/bash

echo "🎮 Setting up Roboflow GPU Inference Server"
echo "============================================"
echo ""

# Check NVIDIA GPU
if ! command -v nvidia-smi &> /dev/null; then
    echo "❌ NVIDIA drivers not found!"
    echo ""
    echo "Install with:"
    echo "  sudo apt update"
    echo "  sudo apt install nvidia-driver-535"
    echo "  sudo reboot"
    echo ""
    exit 1
fi

echo "✅ NVIDIA GPU detected:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
echo ""

# Install NVIDIA Container Toolkit
echo "📦 Installing NVIDIA Container Toolkit..."
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)

curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
    sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
   sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
   sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

sudo apt-get update -qq
sudo apt-get install -y nvidia-container-toolkit

sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

echo "✅ NVIDIA Container Toolkit installed"
echo ""

# Test GPU access
echo "🧪 Testing GPU access in Docker..."
if docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi > /dev/null 2>&1; then
    echo "✅ GPU accessible in Docker"
else
    echo "❌ GPU not accessible in Docker"
    echo "Try: sudo systemctl restart docker"
    exit 1
fi
echo ""

# Get API key
# read -p "Enter your Roboflow API Key: " API_KEY
API_KEY=$(grep ROBOFLOW_API_KEY .env | cut -d '=' -f2)
echo ""

# Stop existing container
echo "🛑 Stopping any existing inference server..."
docker stop roboflow-inference 2>/dev/null
docker rm roboflow-inference 2>/dev/null
echo ""

# Start GPU inference server
echo "🚀 Starting GPU Inference Server..."
echo "   (This may take 1-2 minutes on first run to download the image)"
echo ""

docker run -d \
  --name roboflow-inference \
  --gpus all \
  --restart unless-stopped \
  -p 9001:9001 \
  -e ROBOFLOW_API_KEY=$API_KEY \
  roboflow/roboflow-inference-server-gpu:latest

echo "⏳ Waiting for server to start..."
sleep 15

# Test server
if curl -s http://localhost:9001/ | grep -q "Roboflow"; then
    echo ""
    echo "✅✅✅ SUCCESS! GPU Inference Server is RUNNING! ✅✅✅"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 GPU Status:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    docker exec roboflow-inference nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 NEXT STEPS:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1️⃣  Update your .env file:"
    echo "   Add: ROBOFLOW_INFERENCE_URL=http://localhost:9001"
    echo ""
    echo "2️⃣  Update server.js:"
    echo "   Change URL from:"
    echo "   https://detect.roboflow.com/..."
    echo "   to:"
    echo "   http://localhost:9001/..."
    echo ""
    echo "3️⃣  Optimize for GPU performance in .env:"
    echo "   FRAME_SAMPLE_RATE=1  (process every frame!)"
    echo "   ROBOFLOW_CONFIDENCE=0.4"
    echo "   ROBOFLOW_OVERLAP=0.3"
    echo ""
    echo "4️⃣  Restart your Node.js server:"
    echo "   npm run dev"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 Expected Performance:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "   Inference Time: 20-40ms (vs 200-500ms cloud)"
    echo "   FPS: 25-30 FPS (vs 2-3 FPS cloud)"
    echo "   Speedup: 15x FASTER! 🚀"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔧 Useful Commands:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "   View logs:    docker logs -f roboflow-inference"
    echo "   Check GPU:    nvidia-smi"
    echo "   Restart:      docker restart roboflow-inference"
    echo "   Stop:         docker stop roboflow-inference"
    echo ""
else
    echo ""
    echo "❌ Server failed to start properly"
    echo ""
    echo "Check logs with:"
    echo "  docker logs roboflow-inference"
    echo ""
    echo "Common issues:"
    echo "  1. GPU memory full - check: nvidia-smi"
    echo "  2. Docker not restarted - try: sudo systemctl restart docker"
    echo "  3. Port 9001 in use - check: sudo lsof -i :9001"
    echo ""
fi