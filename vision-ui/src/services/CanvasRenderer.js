/**
 * CanvasRenderer
 * Handles all canvas drawing and rendering
 * Single Responsibility: Canvas rendering only
 */

export class CanvasRenderer {
  constructor(config = {}) {
    this.colorMap = config.colorMap || {
      head: "#FF3B30",
      helmet: "#FF9500",
      hardhat: "#FF9500",
      hand: "#00C7BE",
      glove: "#34C759",
      gloves: "#34C759",
      vest: "#FFD60A",
      safety_vest: "#FFD60A",
      jacket: "#AF52DE",
      person: "#007AFF",
      no_hardhat: "#FF3B30",
      no_safety_vest: "#FF3B30",
      no_gloves: "#FF3B30"
    };
  }

  getTypeColor(type) {
    const lowerType = type.toLowerCase().replace(/[_-]/g, '');
    for (const [key, color] of Object.entries(this.colorMap)) {
      const lowerKey = key.toLowerCase().replace(/[_-]/g, '');
      if (lowerType.includes(lowerKey) || lowerKey.includes(lowerType)) {
        return color;
      }
    }
    return "#f59e0b";
  }

  initializeCanvas(canvas, imageElement) {
    if (!canvas) {
      return false;
    }

    // Handle both img and video elements
    let width, height;
    
    if (imageElement && imageElement.tagName === 'VIDEO') {
      width = imageElement.videoWidth;
      height = imageElement.videoHeight;
    } else if (imageElement && imageElement.tagName === 'IMG') {
      width = imageElement.naturalWidth;
      height = imageElement.naturalHeight;
    } else if (imageElement) {
      // Fallback for other elements
      width = imageElement.width || imageElement.naturalWidth;
      height = imageElement.height || imageElement.naturalHeight;
    }

    if (!width || !height || width === 0 || height === 0) {
      return false;
    }

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    return true;
  }

  clear(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  drawBoundingBox(ctx, box, color, isViolation) {
    const x = box.x;
    const y = box.y;
    const width = box.width;
    const height = box.height;

    // Clamp coordinates
    const clampedX = Math.max(0, Math.min(x, ctx.canvas.width - 1));
    const clampedY = Math.max(0, Math.min(y, ctx.canvas.height - 1));
    const clampedWidth = Math.min(width, ctx.canvas.width - clampedX);
    const clampedHeight = Math.min(height, ctx.canvas.height - clampedY);

    if (clampedWidth <= 0 || clampedHeight <= 0) {
      return;
    }

    // Draw box
    ctx.strokeStyle = color;
    ctx.lineWidth = isViolation ? 5 : 3;
    ctx.strokeRect(clampedX, clampedY, clampedWidth, clampedHeight);

    // Corner markers
    const cornerSize = 12;
    const cornerThickness = 3;
    ctx.fillStyle = color;

    ctx.fillRect(clampedX, clampedY, cornerSize, cornerThickness);
    ctx.fillRect(clampedX, clampedY, cornerThickness, cornerSize);

    ctx.fillRect(clampedX + clampedWidth - cornerSize, clampedY, cornerSize, cornerThickness);
    ctx.fillRect(clampedX + clampedWidth - cornerThickness, clampedY, cornerThickness, cornerSize);

    ctx.fillRect(clampedX, clampedY + clampedHeight - cornerThickness, cornerSize, cornerThickness);
    ctx.fillRect(clampedX, clampedY + clampedHeight - cornerSize, cornerThickness, cornerSize);

    ctx.fillRect(clampedX + clampedWidth - cornerSize, clampedY + clampedHeight - cornerThickness, cornerSize, cornerThickness);
    ctx.fillRect(clampedX + clampedWidth - cornerThickness, clampedY + clampedHeight - cornerSize, cornerThickness, cornerSize);

    return { clampedX, clampedY, clampedWidth, clampedHeight };
  }

  drawLabel(ctx, label, confidence, boxCoords, color) {
    const { clampedX, clampedY, clampedHeight } = boxCoords;

    const confidenceText = `${(confidence * 100).toFixed(0)}%`;
    const labelText = label.replace(/_/g, ' ').toUpperCase();

    ctx.font = "bold 14px 'Segoe UI', Arial, sans-serif";
    const labelWidth = ctx.measureText(labelText).width;
    const confWidth = ctx.measureText(confidenceText).width;
    const totalWidth = Math.max(labelWidth, confWidth) + 16;
    const labelHeight = 52;

    const labelY = clampedY > labelHeight + 10 ? clampedY - labelHeight : clampedY + clampedHeight + 5;

    // Background
    const gradient = ctx.createLinearGradient(clampedX, labelY, clampedX, labelY + labelHeight);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = gradient;
    ctx.fillRect(clampedX, labelY, totalWidth, labelHeight);

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(clampedX, labelY, totalWidth, labelHeight);

    // Text
    ctx.fillStyle = color;
    ctx.font = "bold 14px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(labelText, clampedX + 8, labelY + 20);

    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(confidenceText, clampedX + 8, labelY + 42);
  }

  drawAnnotations(ctx, annotations, canvas) {
    annotations.forEach(annotation => {
      if (!annotation.boundingBox) return;

      const color = this.getTypeColor(annotation.type);
      const isViolation = annotation.type.toLowerCase().includes('no_');

      const boxCoords = this.drawBoundingBox(
        ctx,
        annotation.boundingBox,
        color,
        isViolation
      );

      if (boxCoords) {
        this.drawLabel(ctx, annotation.type, annotation.confidence, boxCoords, color);
      }
    });
  }

  drawStatsPanel(ctx, stats, canvas) {
    const panelWidth = 240;
    const panelHeight = 100;

    const gradient = ctx.createLinearGradient(0, 0, 0, panelHeight);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, panelWidth, panelHeight);

    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, panelWidth, panelHeight);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(`📊 Detections: ${stats.totalDetections}`, 15, 28);

    ctx.font = "14px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(`🎯 Active: ${stats.activeCount}`, 15, 52);
    ctx.fillText(`⚡ FPS: ${stats.fps.toFixed(1)}`, 15, 76);
  }

  drawLiveIndicator(ctx, isProcessing, canvas) {
    if (!isProcessing) return;

    const statusX = canvas.width - 180;
    const statusY = 15;

    ctx.fillStyle = "#10b981";
    ctx.fillRect(statusX, statusY, 165, 40);

    ctx.strokeStyle = "#059669";
    ctx.lineWidth = 2;
    ctx.strokeRect(statusX, statusY, 165, 40);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.fillText("🔴 LIVE", statusX + 15, statusY + 27);
  }

  render(canvas, annotations, stats, isProcessing) {
    if (!canvas) {
      return;
    }

    // Find the media element (video or img) in the canvas parent
    const container = canvas.parentElement;
    const mediaElement = container?.querySelector('video') || container?.querySelector('img');

    if (!this.initializeCanvas(canvas, mediaElement)) {
      return;
    }

    const ctx = canvas.getContext("2d");
    this.clear(canvas);

    this.drawAnnotations(ctx, annotations, canvas);
    this.drawStatsPanel(ctx, stats, canvas);
    this.drawLiveIndicator(ctx, isProcessing, canvas);
  }

  getStatus() {
    return {
      colorMapEntries: Object.keys(this.colorMap).length
    };
  }
}
