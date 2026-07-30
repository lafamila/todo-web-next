---
status: IN_PROGRESS
summary: "prod-local 모드용 프로덕션 빌드 경로 검증 — http 로컬 주소 build-arg 로 next build 가 성립하는지 확인하고 문서화한다."
---

# TODO MODE SIMPLIFICATION — todo-web-next execution plan

Canonical orchestration plan:

`../.idea/TODO_MODE_SIMPLIFICATION_PLAN.md`

## Repo Responsibility

prod-local 모드의 web 이 dev 서버에서 **prod-prod 와 동일한 프로덕션 빌드 이미지**로 바뀐다. 모드 체계는 2×2(dev-local/dev-prod/prod-local/prod-prod)로 확정 — 문서 표기도 이를 따른다. dev 페어에는 web 이 2개다 (:30333 dev-local, **:30334 dev-prod 신규**). 이 레포는 그 빌드가 **http 로컬 주소** build-arg 로 성립하는지 검증하고, 안 되면 최소 수정한다. 이미지를 빌드·구동하는 주체는 루트(`todoctl`/compose)다.

## Inputs / Dependencies

- local 모드 build-arg 값 (root plan env 계약):
  ```
  NEXT_PUBLIC_API_URL=http://localhost:20022/api
  NEXT_PUBLIC_SOCKET_URL=http://localhost:20022
  NEXT_PUBLIC_SOCKET_PATH=/api/socket.io/
  NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
  ```
- 기존 프로덕션 `Dockerfile` (builder 가 4개 build-arg 를 요구하며 비어 있으면 실패) — prod 배포에서 검증된 상태.
- 주의: `deploy-todo-prod.sh` 의 https/wss 강제는 **스크립트 검증**이지 Dockerfile 제약이 아니다. local 빌드는 스크립트를 거치지 않는다.

## Work Items

1. **local 빌드 검증** — 위 build-arg 로 `docker build` 가 성공하고, 컨테이너 기동 후 `/` 200 · 로그인 리다이렉트 · Socket.IO 연결이 http 주소로 정상 동작하는지 확인한다.
   - 특히 확인: 코드 어딘가에 https 전제(secure cookie 판단, `wss://` 강제 등)가 박혀 있지 않은지. `ws://localhost:7880` 는 local 에서 화면공유가 숨겨지므로(features) 실사용 경로는 아니지만 빌드 인자 형식은 통과해야 한다.
2. **불일치 발견 시 최소 수정** — http 로컬 주소에서 깨지는 지점이 있으면 build-arg 나 런타임 분기로 최소 수정 (동작 변경 없이).
3. **문서** — repo `CLAUDE.md` 에 "local 모드 = 프로덕션 빌드, build-arg 는 todoctl 이 주입, 소스 수정은 dev 스택(:30333)에서 확인 후 push→`todoctl local update`" 흐름을 기록. Dockerfile 주석 갱신(빈 `public/` 보장 등 기존 노트 유지).

## Acceptance Criteria

- local build-arg 조합으로 `docker build` 성공 + 컨테이너에서 첫 화면·로그인·메모 목록·에디터·동기화 상태 표시가 정상 (api 는 기존 local 스택 사용).
- `npm run lint` / `npm run build` green (레포 자체 회귀 없음).
- CLAUDE.md 에 새 흐름이 기록되고, dev 서버 전제로 쓰인 낡은 설명이 남아 있지 않다.

## Report Back To Orchestrator

- local 빌드에서 발견한 https 전제·수정 내역 (todoctl 의 빌드 명령에 반영할 사항).
- 빌드 시간 실측 (todoctl local update 의 체감 소요 — 사용자 안내용).
- web 쪽에서 더 이상 필요 없어지는 compose 설정 (WATCHPACK_POLLING, 소스 볼륨 등) 목록.

## Decision Escalation

사용자가 결정해야 하는 주요 사안은 임의로 판단하지 않는다. 작업을 중단하고 현재 orchestrator 에게 전달해 결정받은 뒤 진행한다. orchestrator 에 보고할 수 없으면 workspace root `../.idea/` 에 handoff 문서를 남긴다.
