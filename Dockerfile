# Public NEXT_PUBLIC_* values are embedded into the browser bundle at build time.
# 이 이미지는 prod-local·prod-prod 두 모드가 공유한다 (dev-* 는 Dockerfile.dev).
# 차이는 주입되는 build-arg 값뿐이며 scheme 제약은 없다 —
# prod-local 은 http://localhost:*, prod-prod 는 https/wss 를 받는다.
# (HTTPS/WSS 강제는 ../.scripts/deploy-todo-prod.sh 의 prod 전용 검증이다.)
# 아래 test 는 "비어 있지 않을 것"만 확인한다.
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
# public/ 은 현재 비어 있어 git 이 추적하지 않는다 — 클론에 디렉토리가 없어도
# 아래 runner 단계의 COPY 가 성공하도록 항상 존재를 보장한다.
RUN mkdir -p public
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

# 빌드된 소스의 git ref. todoctl 이 prod-local 이미지를 만들 때 주입하고 `todoctl status` 가 읽는다.
# 마지막 레이어에 둬서 ref 가 바뀌어도 위 COPY 캐시를 깨지 않는다. 미주입 시 빈 값.
ARG TODO_BUILD_REF=""
ENV TODO_BUILD_REF=${TODO_BUILD_REF}
LABEL org.opencontainers.image.revision=${TODO_BUILD_REF}

USER node
EXPOSE 3034

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3034/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
