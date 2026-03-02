# NanoClaw Agent Container
# Runs Claude Agent SDK in isolated Linux VM with browser automation

FROM node:22-slim

# Install system dependencies for X11 + Audio support
# Note: Playwright will install its own patched Firefox (based on stable, not nightly)
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    fonts-noto-color-emoji \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libcups2 \
    libdrm2 \
    libxshmfence1 \
    libwayland-client0 \
    libwayland-cursor0 \
    libwayland-egl1 \
    libxkbcommon0 \
    pulseaudio \
    curl \
    git \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Firefox will automatically download Widevine CDM when needed for DRM content

# Install @playwright/mcp (provides `playwright-mcp` binary) and claude-code globally
RUN npm install -g @playwright/mcp @anthropic-ai/claude-code

# Install Playwright's patched Firefox browser (based on stable Firefox, not nightly)
# Playwright requires its own patched version and cannot use system-installed Firefox
# The browser revision is bundled with @playwright/mcp to ensure compatibility
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN PW_CLI=$(find /usr/local/lib/node_modules -name "cli.js" -path "*/playwright/cli.js" 2>/dev/null | head -1) && \
    [ -n "$PW_CLI" ] && node "$PW_CLI" install --with-deps firefox

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks /workspace/ipc/input

# Create entrypoint script
# Secrets are passed via stdin JSON — temp file is deleted immediately after Node reads it
# Follow-up messages arrive via IPC files in /workspace/ipc/input/
RUN printf '#!/bin/bash\nset -e\ncd /app && npx tsc --outDir /tmp/dist 2>&1 >&2\nln -s /app/node_modules /tmp/dist/node_modules\nchmod -R a-w /tmp/dist\ncat > /tmp/input.json\nnode /tmp/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root) for writable directories
RUN chown -R node:node /workspace && chmod 777 /home/node

# Switch to non-root user (required for --dangerously-skip-permissions)
USER node

# Set working directory to group workspace
WORKDIR /workspace/group

# Entry point reads JSON from stdin, outputs JSON to stdout
ENTRYPOINT ["/app/entrypoint.sh"]
