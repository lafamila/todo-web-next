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

### 로컬 Docker 스택 (2×2 4모드)

모드는 **신선도**(dev = 핫리로드 / prod = 고정 빌드) × **위치**(local = 클라이언트 / prod = 서버)로 갈린다.
스택은 workspace root 의 `todoctl` 이 관리한다.

| `TODO_MODE` | web 주소 | 이미지 | 소스 반영 |
|---|---|---|---|
| **dev-local** | http://localhost:30333 | `Dockerfile.dev` + 소스 mount (`next dev`) | 저장 즉시 (핫리로드) |
| **dev-prod** | http://localhost:30334 | `Dockerfile.dev` + 소스 mount (`next dev`) | 저장 즉시 (핫리로드) |
| **prod-local** | http://localhost:3030 | `Dockerfile` 프로덕션 빌드 | `todoctl local update` 로만 |
| **prod-prod** | https://todo.lafamila.xyz | `Dockerfile` 프로덕션 빌드 (NAS) | 배포 스크립트 |

```bash
# Workspace root
./.scripts/todoctl up dev        # dev 페어 (dev-local + dev-prod, web 포함 4컨테이너)
./.scripts/todoctl up local      # prod-local (실사용 동기화 클라이언트)
./.scripts/todoctl local update  # origin/main fetch → 이미지 재빌드 → 재생성
./.scripts/todoctl status
```

**dev 는 페어다.** dev-local ↔ dev-prod 가 상시 동기화되므로, dev-local 에서 만든 메모가
dev-prod web(`:30334`)에 뜨는지 눈으로 확인할 수 있다 — sync 기능을 개발하는 축소판 실토폴로지다.

**prod-local 은 프로덕션 빌드**라 소스를 고쳐도 화면이 바뀌지 않는다. 코드 확인은 dev 페어에서 하고,
반영은 `git push` → prod-prod 배포 → `todoctl local update` 순서를 탄다.
container 내부 port 는 어느 모드나 `3034` 다.

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
