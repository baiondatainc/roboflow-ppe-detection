#!/usr/bin/env python3
"""
Diagnostic Script - Check entire PPE detection pipeline
"""

import os
import json
import subprocess
import requests
from pathlib import Path
from datetime import datetime

print("\n" + "="*80)
print("🔧 PPE DETECTION PIPELINE DIAGNOSTIC")
print("="*80)

# Check 1: Environment Variables
print("\n1️⃣  CHECKING ENVIRONMENT VARIABLES...")
print("-" * 80)

env_vars = [
    "ROBOFLOW_MODEL",
    "ROBOFLOW_VERSION",
    "ROBOFLOW_API_KEY",
    "ROBOFLOW_CONFIDENCE",
    "ROBOFLOW_OVERLAP"
]

env_status = {}
for var in env_vars:
    value = os.getenv(var)
    if value:
        # Mask API key
        display = value[:10] + "..." if var == "ROBOFLOW_API_KEY" else value
        print(f"   ✅ {var}: {display}")
        env_status[var] = "OK"
    else:
        print(f"   ❌ {var}: NOT SET")
        env_status[var] = "MISSING"

# Check 2: Python Dependencies
print("\n2️⃣  CHECKING PYTHON DEPENDENCIES...")
print("-" * 80)

dependencies = [
    ("cv2", "opencv-python"),
    ("requests", "requests"),
    ("numpy", "numpy"),
    ("dotenv", "python-dotenv")
]

deps_status = {}
for module, package in dependencies:
    try:
        __import__(module)
        print(f"   ✅ {package}")
        deps_status[package] = "OK"
    except ImportError:
        print(f"   ❌ {package} - NOT INSTALLED")
        print(f"      Fix: pip install {package}")
        deps_status[package] = "MISSING"

# Check 3: Server Connectivity
print("\n3️⃣  CHECKING SERVER CONNECTIVITY...")
print("-" * 80)

servers = [
    ("Inference Server (Local)", "http://localhost:9001/health"),
    ("Main Backend", "http://localhost:3001/health"),
    ("Roboflow Cloud API", "https://detect.roboflow.com/")
]

server_status = {}
for name, url in servers:
    try:
        if "detect.roboflow.com" in url:
            response = requests.head(url, timeout=5)
        else:
            response = requests.get(url, timeout=5)
        
        if response.status_code < 400:
            print(f"   ✅ {name}: ONLINE")
            server_status[name] = "OK"
        else:
            print(f"   ⚠️  {name}: Status {response.status_code}")
            server_status[name] = "ISSUE"
    except requests.exceptions.ConnectionError:
        print(f"   ❌ {name}: OFFLINE")
        server_status[name] = "OFFLINE"
    except Exception as e:
        print(f"   ⚠️  {name}: {str(e)[:50]}")
        server_status[name] = "ERROR"

# Check 4: Webcam Availability
print("\n4️⃣  CHECKING WEBCAM DEVICES...")
print("-" * 80)

webcam_status = {}
try:
    result = subprocess.run(["ls", "-la", "/dev/video*"], 
                          capture_output=True, text=True, shell=True)
    devices = result.stdout.strip()
    if devices:
        print(f"   Available devices:")
        for line in devices.split("\n"):
            if line:
                print(f"      {line}")
                if "video" in line:
                    device = line.split()[-1]
                    webcam_status[device] = "AVAILABLE"
    else:
        print(f"   ❌ No webcam devices found")
        print(f"      Check: ls -la /dev/video*")
except Exception as e:
    print(f"   ⚠️  Error checking devices: {e}")

# Check 5: Test Directories
print("\n5️⃣  CHECKING TEST DIRECTORIES...")
print("-" * 80)

test_dir = Path("test_output")
if test_dir.exists():
    print(f"   ✅ {test_dir}: EXISTS")
    files = list(test_dir.glob("*"))
    print(f"      Contains {len(files)} items")
else:
    print(f"   ℹ️  {test_dir}: Will be created on first test")

# Check 6: Node/npm Status
print("\n6️⃣  CHECKING NODE.JS & NPM...")
print("-" * 80)

try:
    node_result = subprocess.run(["node", "--version"], 
                                capture_output=True, text=True, timeout=5)
    if node_result.returncode == 0:
        print(f"   ✅ Node.js: {node_result.stdout.strip()}")
    else:
        print(f"   ❌ Node.js: NOT AVAILABLE")
except:
    print(f"   ❌ Node.js: NOT INSTALLED")

try:
    npm_result = subprocess.run(["npm", "--version"], 
                               capture_output=True, text=True, timeout=5)
    if npm_result.returncode == 0:
        print(f"   ✅ npm: {npm_result.stdout.strip()}")
    else:
        print(f"   ❌ npm: NOT AVAILABLE")
except:
    print(f"   ❌ npm: NOT INSTALLED")

# Check 7: Process Status
print("\n7️⃣  CHECKING RUNNING PROCESSES...")
print("-" * 80)

processes = [
    ("Roboflow Server", "roboflow"),
    ("Backend Server", "node.*server"),
    ("FFmpeg", "ffmpeg")
]

for name, pattern in processes:
    try:
        result = subprocess.run(["pgrep", "-f", pattern], 
                              capture_output=True, text=True, timeout=5)
        if result.stdout.strip():
            pids = result.stdout.strip()
            print(f"   ✅ {name}: RUNNING (PIDs: {pids})")
        else:
            print(f"   ❌ {name}: NOT RUNNING")
    except Exception as e:
        print(f"   ⚠️  {name}: Error checking - {str(e)[:30]}")

# Summary Report
print("\n" + "="*80)
print("📋 DIAGNOSTIC SUMMARY")
print("="*80)

all_issues = []

# Environment issues
missing_env = [k for k, v in env_status.items() if v == "MISSING"]
if missing_env:
    all_issues.append(f"Missing environment variables: {', '.join(missing_env)}")

# Dependency issues
missing_deps = [k for k, v in deps_status.items() if v == "MISSING"]
if missing_deps:
    all_issues.append(f"Missing Python packages: {', '.join(missing_deps)}")

# Server issues
offline_servers = [k for k, v in server_status.items() if v == "OFFLINE"]
if offline_servers:
    all_issues.append(f"Offline servers: {', '.join(offline_servers)}")

if not all_issues:
    print("\n✅ ALL CHECKS PASSED!")
    print("\n🚀 You're ready to run tests:")
    print("   1. Start inference server: python -m roboflow.inference.server --port 9001")
    print("   2. Start backend: npm start")
    print("   3. Run tests: python quick_test.py")
else:
    print("\n⚠️  ISSUES FOUND:\n")
    for i, issue in enumerate(all_issues, 1):
        print(f"   {i}. {issue}")

print("\n" + "="*80)

# Recommendations
print("\n💡 QUICK START GUIDE")
print("-" * 80)
print("""
# Terminal 1: Start Roboflow Inference Server
python -m roboflow.inference.server --port 9001

# Terminal 2: Start Backend Server
cd vision-ui && npm start

# Terminal 3: Run Quick Test
python quick_test.py

# View Results
ls -la test_output/
""")

print("="*80 + "\n")
