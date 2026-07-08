# todo-web-next

Next.js 16 프론트엔드 — standalone todo 서비스의 UI. 데이터/세션/실시간은 모두 `todo-api-fastapi` 를 직접 호출한다.

## 로컬 실행

```bash
npm install
npm run dev     # http://localhost:3034 (dev script 에 --port 3034 고정)
```

- 백엔드로 `todo-api-fastapi` 가 `http://localhost:8000` 에서 떠 있어야 한다 (API prefix `/api`). 세션 로그인, Socket.IO realtime, LiveKit token 발급 모두 그 서버가 소유한다.
- 환경변수는 `.env.example` 참조: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_SOCKET_PATH`, `NEXT_PUBLIC_LIVEKIT_URL`.

## 빌드 / 린트

```bash
npm run build   # production 검증 기준
npm run lint    # ESLint
npm run start   # production 서버 (--port 3034)
```

## Docker

public env 는 빌드 시점에 주입된다 (Next.js 특성상 build arg 필수).

```bash
docker build -t todo-web-next \
  --build-arg NEXT_PUBLIC_API_URL=https://todo-api.example.com/api \
  --build-arg NEXT_PUBLIC_SOCKET_URL=https://todo-api.example.com \
  --build-arg NEXT_PUBLIC_SOCKET_PATH=/api/socket.io/ \
  --build-arg NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.example.com \
  .
```

## 상세

인증/세션 규칙, 워크스페이스 대원칙, feature workflow 등 상세 가이드는 [`CLAUDE.md`](./CLAUDE.md) 참조.
