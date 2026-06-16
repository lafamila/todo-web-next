---
status: COMPLETED
summary: "todo 로그인 화면의 ID/PW form 을 제거하고 auth-hosted login 시작 버튼으로 전환한다."
completed_at: 2026-06-16
completion_reason: "todo hosted-login UI 전환 및 로컬 검증 완료"
---

# AUTH_HOSTED_LOGIN_PLAN — todo-web-next execution plan

Canonical orchestration plan:

`../../.idea/AUTH_HOSTED_LOGIN_PLAN.md`

## Repo Responsibility
todo 독립 웹 서비스의 로그인 시작 UI 를 제공한다. 중앙 계정 credential 을 직접 받지 않고 todo-api-fastapi 의 OIDC start endpoint 를 통해 auth-hosted login 으로 이동한다.

## Inputs / Dependencies
- todo-api-fastapi 의 login-start endpoint.
- callback 후 todo-api-fastapi 가 발급하는 HttpOnly todo session cookie.
- 기존 `AuthContext` 의 `/session/me` 기반 session 복원.
- access denied 는 todo-api-fastapi callback/error 결과 또는 `/session/me` 의 role/permission 결과를 기준으로 todo 화면에서 자체 처리한다.

## Work Items
1. `/login` 페이지에서 ID/PW 입력 form 과 credential submit 을 제거한다.
2. `로그인` 버튼을 누르면 todo-api-fastapi OIDC start endpoint 를 호출하고 반환된 authorize URL 로 이동한다.
3. 로그인 진행/실패 상태만 간단히 표시한다. 버튼명은 기본 `로그인`, 진행 중은 필요하면 `로그인 중...`으로 둔다.
4. `src/lib/api.ts` 의 `login(username, password)` 를 새 login-start 함수로 교체한다.
5. `AuthContext` 의 `login(username, password)` signature 를 credential 없는 `login()` 또는 `startLogin()` 형태로 바꾼다.
6. callback 후 돌아온 사용자는 기존 `/session/me` restore 로 인증 상태를 복원하게 한다.
7. access denied/error query 가 돌아오면 todo 서비스 맥락에 맞는 실패 상태를 표시한다.
8. `/todo/login` legacy redirect page 와 관련 dead code 를 제거하거나 현재 라우팅에 필요한 최소 redirect 만 남긴다.
9. tests/lint/typecheck 를 실행한다.

## Acceptance Criteria
- todo-web-next 에 중앙 auth ID/PW 입력 UI 가 없다.
- 사용자에게 보이는 login 시작 버튼 문구는 `로그인`이다.
- login button 이 todo-api-fastapi start endpoint 를 호출하고 auth-api-nest authorize URL 로 이동한다.
- callback 후 `/session/me` 로 user 가 복원되는 흐름이 유지된다.
- `rg "/session/login|login\\(username|password"` 로 legacy credential login 잔여 사용처가 남지 않는다.

## Report Back To Orchestrator
- todo-api-fastapi 와 맞춘 최종 login-start 응답 shape.
- callback 후 redirect destination 처리 방식.
- `.env.example` 변경 여부.

## Decision Escalation
사용자가 결정해야 하는 주요 사안은 임의로 판단하지 않는다. 작업을 중단하고 현재 orchestrator 에게 전달해 결정받은 뒤 진행한다. orchestrator 에 보고할 수 없으면 workspace root `.idea/` 에 handoff 문서를 남긴다.
