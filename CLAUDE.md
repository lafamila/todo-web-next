# todo-web-next

Next.js 16 frontend for the standalone todo service. This repo owns the todo user interface that used to live inside `ted-yee-beer-house-web-next`.

> 이 파일이 본 레포의 canonical 가이드입니다. `AGENTS.md` 는 codex 호환용 stub 입니다.

## 워크스페이스 대원칙 (canonical)

이 레포는 `../CLAUDE.md` 의 **DEVELOPMENT PRINCIPLES** 섹션을 따른다. 핵심 재진술:

1. **인증** — `auth-api-nest` 와 통합된 `todo-api-fastapi` session API 를 사용한다. 브라우저는 access token/refresh token 을 직접 저장하지 않는다.
2. **기능 단위 커밋** — 한 기능이 계획-구현-검토를 통과하면 즉시 1개의 커밋. 여러 기능을 묶지 않는다.
3. **Agent co-author 제외** — Codex, Claude, OmX 등 agent/tool 저자를 `Co-authored-by` trailer 로 추가하지 않는다. 사용자가 명시적으로 요청한 경우만 예외.
4. **계획 → 구현 → 검토** — 계획 단계에서 검토 통과 기준(어떤 테스트/명령이 통과해야 "done"인지)을 명시한다.
5. **Docker 빌드 가능** — DEPLOY. 이 레포는 독립 배포 frontend 이며 Dockerfile 과 public env/build arg 문서를 repo 안에서 유지한다. root `docker-compose.yml` 의 앱 서비스로 배포하지 않는다.
6. **Cross-repo 영향 보고** — 이 레포의 변경이 다른 repo, 공통 API 계약, auth claim/permission, env var, Docker/deploy 설정, 공통 문서에 영향을 준다고 판단되면 현재 orchestrator 에게 반드시 보고한다. 직접 보고할 수 없으면 워크스페이스 루트 `../.idea/` 에 `TODO_WEB_NEXT_CROSS_REPO_IMPACT_{YYYYMMDD}.md` 형식의 handoff 문서를 남긴다.
7. **사용자 결정 필요사항 에스컬레이션** — 사용자가 결정해야 하는 주요 사안은 임의로 판단하지 않고 작업을 중단한 뒤 현재 orchestrator 에게 전달하여 결정받고 진행한다. orchestrator 에 보고할 수 없으면 workspace root `../.idea/` 에 handoff 문서를 남긴다.

## Feature Workflow

1. `.idea/` 의 repo-specific execution plan 을 선택
2. root canonical plan 을 확인해 전체 그림과 repo 간 계약을 이해
3. 계획서의 Work Items 를 구현
4. Acceptance Criteria 를 직접 실행/검증
5. cross-repo 영향이나 사용자 결정 필요사항을 orchestrator 에 보고
6. 통과 시 1개의 커밋으로 마무리

## Project Direction

- 기존 `ted-yee-beer-house-web-next/src/app/todo` 디자인과 UX를 우선 보존한다.
- API 호출은 `todo-api-fastapi` 를 직접 대상으로 한다.
- session은 `todo-api-fastapi` 의 HttpOnly cookie 기반 endpoint를 사용한다.
- realtime은 `todo-api-fastapi` 의 Python Socket.IO endpoint를 사용한다.
- LiveKit viewer/publisher UI는 유지하되 token 발급 endpoint는 `todo-api-fastapi` 로 바꾼다.

## Expected Stack

- Next.js 16
- React 19
- Tailwind CSS v4
- TypeScript
- `socket.io-client`
- `livekit-client`

## Ports

- local dev: `3034`
- API target: `todo-api-fastapi` local `http://localhost:8000/api`

## Local / Deploy Env

- local 개발 서버는 `npm run dev` 로 `3034` 포트에서 실행한다.
- production 검증 기준은 `npm run build` 이다.
- 독립 배포 시 Docker build 는 `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_SOCKET_PATH`, `NEXT_PUBLIC_LIVEKIT_URL` 을 build arg 로 주입해 생성한다.
- root compose 제거 이후에도 API, socket, LiveKit 대상은 이 repo 의 public env 값으로 교체한다.
- infra 의 실제 호스트는 root infra compose 또는 운영 환경이 제공한다. 이 frontend repo 는 host 값을 직접 고정하지 않는다.

## Security

- Do not store auth-api access tokens or refresh tokens in localStorage/sessionStorage.
- Use `credentials: "include"` for session-backed API calls.
- Any public read behavior must be explicitly designed in a separate plan; do not expose non-Teddy-authored data through beer-house compatibility work.
