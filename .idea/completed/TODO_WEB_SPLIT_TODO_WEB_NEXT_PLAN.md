---
status: COMPLETED
summary: "기존 beer-house todo UI를 todo-web-next 독립 Next 앱으로 옮기고 todo-api-fastapi와 직접 통신하게 한다."
---

# TODO WEB SPLIT — todo-web-next execution plan

Canonical orchestration plan:

`../.idea/TODO_WEB_SPLIT_PLAN.md`

## Repo Responsibility
`todo-web-next` 는 독립 todo 프론트엔드가 된다. 기존 `ted-yee-beer-house-web-next` 안의 todo UI/contexts/hooks/API client/types/styles를 옮겨오고, `todo-api-fastapi` 의 session/REST/Socket.IO/LiveKit endpoints와 직접 통신하게 만든다.

## Inputs / Dependencies
- Root canonical plan: `/Users/lafamila/work/teddy/.idea/TODO_WEB_SPLIT_PLAN.md`
- Source UI repo: `/Users/lafamila/work/teddy/ted-yee-beer-house-web-next`
- Backend target: `/Users/lafamila/work/teddy/todo-api-fastapi`
- Dev port: `3034`
- API base URL: local default `http://localhost:8000/api`

## Work Items
1. Next.js 16 + React 19 + Tailwind v4 app scaffold를 만든다. 기존 beer-house web의 `package.json`, `next.config.ts`, TypeScript, ESLint, Tailwind/PostCSS 설정을 필요한 범위만 복제한다.
2. 기존 todo UI를 옮긴다.
   - `src/app/todo/page.tsx`
   - `src/app/todo/login/page.tsx`
   - `src/app/todo/layout.tsx`
   - `src/app/todo/_components/*`
   - `src/app/todo/global.css`
3. todo 상태/context/hook/API/type 의존성을 옮긴다.
   - `src/contexts/AuthContext.tsx`
   - `src/contexts/AppContext.tsx`
   - todo에 필요한 `src/hooks/useMemoSocket.ts`, `src/hooks/useScreenShare.ts`
   - todo에 필요한 `src/lib/api.ts`, `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/utils.ts`
   - todo에 필요한 `src/components/ui/*`, `src/components/editor/*`, icon assets
4. beer-house 전용 landing/game/travel 코드와 todo에 필요 없는 dependency를 가져오지 않는다.
5. API client를 `todo-api-fastapi` 직접 호출 기준으로 정리한다.
   - session endpoints: `/api/session/login`, `/api/session/logout`, `/api/session/me`, `/api/session/service-application`
   - REST endpoints: 기존 `/api/projects`, `/api/memos`, `/api/articles`, `/api/daily-tasks`
   - LiveKit token: `/api/livekit/token`
   - fetch는 session cookie를 위해 `credentials: "include"` 를 유지한다.
6. Socket.IO client target을 `todo-api-fastapi` 로 바꾼다.
   - path는 backend plan과 맞춘다.
   - session cookie가 전송되도록 `withCredentials: true` 를 유지한다.
7. dev script가 port `3034` 를 사용하도록 설정한다.
8. Dockerfile을 추가해 production build가 가능하게 한다.

## Acceptance Criteria
- `npm install` 후 `npm run build` 가 통과한다.
- `npm run lint` 가 통과하거나, 기존 이관 코드의 lint gap이 명확히 문서화된다.
- `npm run dev` 는 port `3034` 에서 실행되도록 설정되어 있다.
- 브라우저 토큰 저장소에 auth token을 저장하지 않는다.
- todo UI가 beer-house import alias나 beer-house-only 파일에 의존하지 않는다.
- API base URL, Socket.IO URL/path, LiveKit URL이 env로 조정 가능하다.

## Report Back To Orchestrator
- 옮기지 못한 shared component/style/icon이 있으면 파일명과 이유를 보고한다.
- `todo-api-fastapi` 에 필요한 endpoint/path/CORS/socket contract 변경을 보고한다.
- beer-house web에서 제거해야 하는 파일 목록이 추가로 발견되면 보고한다.

## Decision Escalation
사용자가 결정해야 하는 주요 사안은 임의로 판단하지 않는다. 작업을 중단하고 현재 orchestrator 에게 전달해 결정받은 뒤 진행한다. orchestrator 에 보고할 수 없으면 workspace root `.idea/` 에 handoff 문서를 남긴다.
