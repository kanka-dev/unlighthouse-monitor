FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

# System dependencies: Chromium (used by Unlighthouse via Puppeteer),
# build tools for native modules, tini as init, tzdata for cron timezone.
RUN apk upgrade --no-cache \
    && apk add --no-cache \
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
ARG SUPERCRONIC_VERSION=v0.2.51
ARG SUPERCRONIC_SHA256=cc232108374e8e2b537045f2d5eaa1229f619db314c3ba6a14d38b35dc0aa123
RUN curl -fsSL -o /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && echo "${SUPERCRONIC_SHA256}  /usr/local/bin/supercronic" | sha256sum -c - \
    && chmod +x /usr/local/bin/supercronic

# Unlighthouse global installieren (spart npx-Download bei jedem Run)
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install -g @unlighthouse/cli@0.20.0 puppeteer-core@25.18.1 \
    && npm cache clean --force

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /app

# JS dependencies for our own scripts (YAML parser)
COPY scripts/package.json scripts/package-lock.json /app/scripts/
RUN cd /app/scripts && npm ci --omit=dev && npm cache clean --force

COPY scripts/*.js /app/scripts/
COPY unlighthouse.config.ts /app/unlighthouse.config.ts
RUN chmod +x /app/scripts/*.js

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["supercronic", "-passthrough-logs", "/app/crontab"]
