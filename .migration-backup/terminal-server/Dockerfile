FROM node:20-slim

# node-pty needs python + make + g++ for native build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    # claude CLI dependencies
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install claude CLI globally
RUN curl -fsSL https://claude.ai/install.sh | sh || \
    npm install -g @anthropic-ai/claude-code 2>/dev/null || true

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

COPY server.js .

ENV PORT=3001
ENV TERMINAL_COMMAND=claude

EXPOSE 3001
CMD ["node", "server.js"]
