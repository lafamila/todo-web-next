# Public NEXT_PUBLIC_* values are embedded into the browser bundle at build time.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_SOCKET_PATH
ARG NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL} \
    NEXT_PUBLIC_SOCKET_PATH=${NEXT_PUBLIC_SOCKET_PATH} \
    NEXT_PUBLIC_LIVEKIT_URL=${NEXT_PUBLIC_LIVEKIT_URL} \
    NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN test -n "${NEXT_PUBLIC_API_URL}" \
    && test -n "${NEXT_PUBLIC_SOCKET_URL}" \
    && test -n "${NEXT_PUBLIC_SOCKET_PATH}" \
    && test -n "${NEXT_PUBLIC_LIVEKIT_URL}"
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Seoul \
    PORT=3034 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3034

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3034/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
