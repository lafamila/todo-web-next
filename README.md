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

### 로컬 Docker 개발

Docker 개발 서버는 host `127.0.0.1:3030` 에만 공개되고, container 안에서는
`0.0.0.0:3034` 로 실행된다. 기본 API/Socket.IO browser URL은
`http://localhost:20022` 이다.

```bash
# Workspace root
docker compose -f .scripts/todo/compose.yml up -d --build
# http://localhost:3030
```

소스와 분리된 named volume 이 `node_modules` 와 `.next` 를 보관한다. 종료 시에는
`docker compose -f .scripts/todo/compose.yml down` 을 사용한다.

### 운영 Docker 배포

public env 는 Next.js 빌드 시점에 browser bundle에 포함되므로 build arg 로
주입해야 한다. 운영 서버의 `/volume1/www/todo-web-next/.env.build`를
`.env.build.example` 기준으로 작성한 뒤 workspace 배포 스크립트를 실행한다.

```bash
cp .env.build.example .env.build
# .env.build 의 example.com 값을 실제 browser 공개 URL로 교체

cd /volume1/www
./.scripts/deploy-todo-prod.sh --dry-run
./.scripts/deploy-todo-prod.sh
```

`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_LIVEKIT_URL` 에는
browser가 접근할 수 있는 HTTPS/WSS 주소(또는 reverse proxy가 제공하는
same-origin 경로)를 사용한다. `todo-api-fastapi` 같은 Docker service name은
browser에서 해석할 수 없으므로 넣지 않는다. 이 값들은 공개 값이며, 비밀 값은
`.env.build` 에 추가하지 않는다.

운영 app Compose는 사용하지 않는다. 배포 스크립트가 두 레포를 pull/build한 후
기존 API/Web container를 제거하고 external `teddy-infra` network에서
`restart: unless-stopped`로 실행한다. 기본 Web bind는
`127.0.0.1:3034`이며 `TODO_WEB_BIND_ADDRESS`/`TODO_WEB_HOST_PORT`로 재정의할
수 있다. container 내부 port는 항상 `3034`다.

## 상세

인증/세션 규칙, 워크스페이스 대원칙, feature workflow 등 상세 가이드는 [`CLAUDE.md`](./CLAUDE.md) 참조.
