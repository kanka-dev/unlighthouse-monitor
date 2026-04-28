FROM node:20-alpine

# System dependencies: Chromium (used by Unlighthouse via Puppeteer),
# build tools for native modules, tini as init, tzdata for cron timezone.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto-emoji \
      bash \
      curl \
      tini \
      tzdata \
    && rm -rf /var/cache/apk/*

# supercronic: Docker-natives Cron, leitet Logs an stdout weiter, respektiert Signale
ARG SUPERCRONIC_VERSION=v0.2.33
ARG SUPERCRONIC_SHA=71b0d58cc53f6bd72cf2f293e09e294b79c666d8
RUN curl -fsSL -o /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && chmod +x /usr/local/bin/supercronic

# Unlighthouse global installieren (spart npx-Download bei jedem Run)
RUN npm install -g @unlighthouse/cli@latest puppeteer-core \
    && npm cache clean --force

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /app

# JS dependencies for our own scripts (YAML parser)
COPY scripts/package.json scripts/package-lock.json* /app/scripts/
RUN cd /app/scripts && npm install --omit=dev && npm cache clean --force

COPY scripts/ /app/scripts/
COPY unlighthouse.config.ts /app/unlighthouse.config.ts
RUN chmod +x /app/scripts/*.js /app/scripts/*.sh 2>/dev/null || true

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["supercronic", "-passthrough-logs", "/app/crontab"]
