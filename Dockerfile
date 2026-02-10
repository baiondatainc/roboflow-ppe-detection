FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl

# Copy root package files
COPY package*.json ./

# Install root dependencies
RUN npm ci --production

# Copy vision-ui package files
COPY vision-ui/package*.json ./vision-ui/

# Install frontend dependencies and build
WORKDIR /app/vision-ui
RUN npm ci
RUN npm run build

# Copy entire application
WORKDIR /app
COPY . .

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start application
CMD ["node", "server.js"]
