# Railway Dockerfile for BhavTOL Backend
# Uses Node 20 with Chromium pre-installed for Puppeteer scraping

FROM node:20-slim

# Install Chromium and its dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    dbus \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to skip downloading Chrome (we use system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Copy package files first (better Docker layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy the rest of the backend code
COPY . .

# Expose port (Railway sets PORT env var automatically)
EXPOSE ${PORT:-3000}

# Start the server
CMD ["node", "server.js"]
