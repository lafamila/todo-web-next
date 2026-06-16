---
status: COMPLETED
completed_at: 2026-06-16
completion_reason: "Implemented infra-only root deployment model and repo deployment documentation."
summary: "todo-web-next 를 독립 배포 frontend 로 문서화하고 root compose 의 todo-web 앱 전제를 제거한다."
---

# WORKSPACE DEPLOY INFRA SPLIT — todo-web-next execution plan

Canonical orchestration plan:

`../../.idea/WORKSPACE_DEPLOY_INFRA_SPLIT_PLAN.md`

## Repo Responsibility
`todo-web-next` 는 standalone todo frontend 다. root compose 의 `todo-web-next` 앱 서비스가 아니라, 자기 Dockerfile/build args/env 문서로 배포된다.

## Inputs / Dependencies
- `todo-api-fastapi` 의 public API/socket/livekit URL 을 env/build arg 로 받는다.
- auth token/secret 은 frontend 로 노출하지 않는다.
- local port 3034 원칙은 유지한다.

## Work Items
1. `CLAUDE.md` 의 root docker-compose 등록 예정 표현을 독립 배포 표현으로 수정한다.
2. `.env.example` 과 Dockerfile build args 가 `NEXT_PUBLIC_API_URL`, socket, LiveKit URL 을 명확히 다루는지 확인한다.
3. local run (`npm run dev`) 과 production build (`npm run build`, Docker build) 를 구분해 문서화한다.
4. root compose 제거 이후에도 todo API URL 을 환경값으로 바꿀 수 있는지 확인한다.

## Acceptance Criteria
- 문서에서 todo web 이 root compose 앱 서비스로 기본 배포된다는 표현이 없다.
- public env/build arg 가 `.env.example` 과 문서에 정리되어 있다.
- `npm run build` 또는 repo 표준 검증 명령이 문서상 기준으로 남아 있다.

## Report Back To Orchestrator
- todo-api-fastapi 와 맞춰야 하는 URL/cookie/CORS 값.
- Dockerfile build arg 변경 필요.

## Decision Escalation
사용자가 결정해야 하는 주요 사안은 임의로 판단하지 않는다. 작업을 중단하고 현재 orchestrator 에게 전달해 결정받은 뒤 진행한다. orchestrator 에 보고할 수 없으면 workspace root `.idea/` 에 handoff 문서를 남긴다.

