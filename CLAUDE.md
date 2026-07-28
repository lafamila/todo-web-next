# todo-web-next

Next.js 16 frontend for the standalone todo service. This repo owns the todo user interface that used to live inside `ted-yee-beer-house-web-next`.

> 이 파일이 본 레포의 canonical 가이드입니다. `AGENTS.md` 는 codex 호환용 stub 입니다.

- **Lifecycle**: DEPLOY
- **Status**: active
- **Port**: 3034
- **Auth**: via todo-api-fastapi 세션 — 자체 OIDC client 없음

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
- **디자인 원형**: `~/Desktop/lafamila/todo-next` (로컬 :3030, docker 컨테이너 `todo-front`) — todo UI 의 원조.
  폰트(Arial/Helvetica)와 `todo/global.css` 의 레이아웃 치수(80px 타이틀 행, `.main` 그리드 리듬, task 좌측 인셋 20px 등)는
  이 원형을 기준으로 맞춘다. 주의: Tailwind v4 유틸리티는 cascade layer 안에 있어 **unlayered 인 `todo/global.css` 규칙이
  body 의 Tailwind 클래스(`bg-black` 등)를 이긴다** — body 배경은 실제로 global.css 의 `--white` 가 적용된다.
- API 호출은 `todo-api-fastapi` 를 직접 대상으로 한다.
- session은 `todo-api-fastapi` 의 HttpOnly cookie 기반 endpoint를 사용한다.
- realtime은 `todo-api-fastapi` 의 Python Socket.IO endpoint를 사용한다.
- LiveKit viewer/publisher UI는 유지하되 token 발급 endpoint는 `todo-api-fastapi` 로 바꾼다.

## Memo Editor (인라인 라이브 렌더링)

메모 본문 편집기는 **편집창/미리보기 분리가 없는 단일 서피스**다. 활성 라인 1개만 `<textarea>` 로
살아 있고 나머지 라인은 렌더된 블록으로 남는다. 구현은 `src/components/editor/inline/` 에 있고
`MemoSection` 이 이를 호스팅한다.

- **데이터 모델**: `EditorLine { id, text }`. 로드 = `content.split('\n')`, 저장 = `join('\n')`.
  **바이트 동일 왕복이 불변식**이다 (개행 손실 금지). `id` 는 세션-로컬 값으로 React key 안정성만 담당한다.
- **라인 상태**: `rendered` → (더블클릭) → `editing` → (완결 패턴 + 2초 무변경 + 조합 중 아님) →
  `focused-rendered` → (Backspace 1회는 삭제 없이 소스 복귀 / 문자 입력·조합 시작도 소스 복귀).
  blur·Escape·다른 라인 활성화는 즉시 `rendered`. `--` 나 `-- ` 같은 미완결 패턴은 절대 자동 렌더되지 않는다.
- **타이머 2종**: `renderSettleTimer`(2초, 자동 렌더)와 `MemoSection` 의 6초 락 해제 타이머는 **별개**다.
  6초 타이머는 "활성 라인이 없을 때만" 돈다 (`onEditingChange`).
- **포커스 판정(`isTypingContext`)**: 전역 "아무 키나 누르면 편집 시작" 핸들러는 이미 입력 중인 곳에서는
  물러나야 한다. Monaco 는 EditContext API 를 쓰면 포커스 대상이 textarea 도 contenteditable 도 아닌
  `div.native-edit-context` 라, tag/contentEditable 만 보면 **코드편집기 입력을 가로채 마지막 라인
  (닫는 펜스)으로 글자를 보낸다**. `.monaco-editor` 조상 검사를 반드시 유지할 것. 코드편집기 포커스는
  `onFocusChange` 로 `onEditingChange` 에 연결되어 있어 타이핑 중 6초 락 해제도 일어나지 않는다.
- **IME**: `composingRef` 로 조합 중에는 렌더 타이머·라인 전환·분할/병합을 모두 막는다.
  `e.isComposing || e.keyCode === 229` 인 keydown 은 상태 머신 입력이 아니다. 전역 "아무 키나 입력하면
  편집 시작" 핸들러는 `preventDefault` 하지 않고 마지막 라인에 포커스만 옮긴다 (수동 append 금지 — 이중 입력 원인).
- **구조 편집**: Enter 분할 / 라인 시작 Backspace 병합 / 라인 끝 Delete 다음 줄 병합 / ↑·↓ 인접 라인 이동
  (캐럿 열 유지) / 줄 시작 ← 와 줄 끝 → 는 앞뒤 줄로 넘어간다(⌘·Alt 조합은 줄 처음·끝/단어 이동이라 건드리지 않는다). 활성 라인에 개행이 들어오면 `handleLineChange` 가 라인 분할로 흡수한다.
- **코드블록 생성**: 라인이 여는 펜스가 되는 순간 `openCodeBlock` 이 **빈 본문 + 닫는 펜스를 함께 삽입**하고
  펜스 라인을 비활성화한 뒤 포커스를 Monaco 로 넘긴다(`pendingCodeFocusId` → `MonacoCodeEditor autoFocus`).
  이렇게 하지 않으면 방금 친 펜스 라인이 활성 상태로 남아 ``` 가 코드편집기 위에 그대로 보이고
  (펜스는 2초 자동 렌더 대상이 아니라 스스로 접히지 않는다) 닫는 펜스가 없어 뒤따르는 문서가 코드 본문으로 빨려 들어간다.
  타이핑 중 생성이라 마크다운 접미 표기(` ```java `)는 ``` 시점에 이미 블록이 되므로, 언어는 접두 표기(`java``` `)나
  Monaco 헤더 선택기로 지정한다. 여러 줄 붙여넣기는 이 경로를 타지 않아 원문 펜스가 그대로 보존된다.
- **코드펜스**: 펜스 라인만 라인 편집 대상이고 본문은 항상 Monaco 가 소유한다. 자동 렌더 없음.
  방향키 이동은 Monaco 본문 라인을 건너뛴다. 펜스 라인은 **비활성일 때 화면에서 감춰지고**
  (`.editor-line-fence-collapsed`, 높이 0) 방향키로 진입하면 다시 펼쳐져 편집·삭제할 수 있다.
- **펜스 문법과 언어** (`src/lib/codeFence.ts` 가 단일 소스 — `parseContent` 와 인라인 에디터가 공유한다):
  ` ``` `(기본 typescript) · ` ```java `(마크다운 표준, 기존 메모 호환) · `java``` `(언어를 앞에 쓰는 표기).
  세 표기 모두 **줄 전체**가 펜스여야 하며(들여쓰기·뒤따르는 문장 불가 — 설명문으로 쓴 줄을 보호한다),
  앞에 쓰는 표기는 **그 단어가 지원 언어일 때만** 펜스로 본다. 별칭은 canonical Monaco id 로 접힌다
  (`bash`→`shell`, `tsx`/`ts`→`typescript`, `text`→`plaintext` …). Monaco 에 없는 id 를 넘기면 하이라이팅이
  조용히 꺼지므로 언어는 반드시 이 모듈을 거쳐 정규화한다. Monaco 헤더의 언어 선택기는 결과를 여는 펜스
  라인에 되쓴다(`setCodeGroupLanguage` → `formatCodeFence`; 기본 언어면 ` ``` ` 만 남긴다).
- **Undo/redo**: 문서 스냅샷 스택(`history.ts`, 최대 200, 500ms 병합). 활성 라인 안에서 타이핑한 내용이
  남아 있는 동안에는 네이티브 undo 를 우선한다.
- **Raw 모드 (Cmd/Ctrl+E)**: 문서 전체를 하나의 textarea 로 여는 escape hatch. 멀티라인 선택/복사와
  `@메모명` 검색이 필요할 때 쓴다.
- **줄을 넘는 선택은 Raw 모드가 이어받는다**: 라인마다 textarea 가 따로라 DOM 선택이 줄 경계를 넘지 못한다.
  `Cmd/Ctrl+A`(`onSelectAll`), `Shift+방향키`(`onSelectRange`; ←/→ 는 줄 경계에서만), 그리고 렌더 화면에서
  **마우스 드래그**로 만든 선택(서피스 `mouseup` → `selectDomRange`; 더블·트리플 클릭은 `e.detail >= 2` 로
  제외해 줄 편집 진입을 남긴다)은 기본 동작을 막고 Raw 모드로 전환하면서
  선택을 그대로 복원한다 — 전체 선택이거나, 네이티브와 같은 열 유지 규칙으로 계산한 anchor→focus 오프셋이다.
  `selectionDirection` 까지 넘겨야 이어지는 Shift+방향키가 같은 쪽으로 확장된다. 렌더 화면을 DOM 으로
  선택하는 방식은 복사 시 `-- `·펜스 같은 소스가 사라져 채택하지 않았다.
- **선택 때문에 켜진 Raw 모드는 일시적이다**: `rawModeReasonRef` 가 진입 경로를 기억한다.
  `'selection'` 이면 복사·잘라내기(다음 프레임에 전환 — 같은 틱에 언마운트하면 클립보드 쓰기가 취소된다)나
  선택 해제(내비게이션 키·클릭; 타이핑은 제외) 직후 인라인으로 돌아오며, 캐럿은
  `InlineEditor.focusOffset(문서 오프셋)` 으로 원래 자리에 복원한다(코드 본문에 걸리면 직전 편집 가능 줄).
  `'manual'`(Cmd/Ctrl+E)은 사용자가 명시적으로 켠 소스 뷰라 자동으로 닫지 않는다.
- **모드 전환은 스크롤 위치를 이어받는다**: 인라인은 감싼 `div`(`inlineScrollRef`)가, Raw 모드는
  `textarea` 자신이 스크롤한다 — **스크롤러가 서로 다른 요소**라 그냥 전환하면 새 서피스가 맨 위에서 시작해
  화면이 최상단으로 튄다. 두 서피스의 내용 높이가 달라 픽셀값은 못 쓰므로 스크롤 비율(0~1)을 넘기고
  (`scrollFractionOf`/`applyScrollFraction`), 승격 시에는 그 뒤에 `ensureOffsetVisible` 로 선택 지점이
  화면 밖이면 최소한만 보정한다. 복귀 시에는 비율을 먼저 적용해야 `focusOffset` 의 scroll-into-view 가
  덜 움직인다.
- **불변 계약**: 저장은 Ctrl/⌘+S 만 (자동 저장 없음), 체크박스 토글만 즉시 서버 반영, Socket.IO 단일 작성자 락,
  `PUT /api/memos/{id}` 계약 — 전부 그대로다. 에디터는 API/소켓을 바꾸지 않는다.
- **`parseContent` 와의 관계**: `lib/utils.ts` 의 `parseContent` 는 `ArticleDetail` 이 계속 사용한다.
  신규 `classifyLine`/`buildLineGroups` 가 같은 판정을 유지하는지 개발 모드에서
  `assertClassifierMatchesParseContent` 가 감시한다. 문법을 바꾸면 **두 경로를 함께** 고쳐야 한다.
- **블록 스타일**: 렌더된 체크박스/코드/마크다운 블록은 `src/components/editor/blocks/ContentBlocks.tsx`
  하나에서 나온다. 에디터와 `ArticleDetail` 이 같은 컴포넌트를 쓰므로 한쪽만 손대 시각이 갈라지지 않게 한다.
- **시각 토큰**: `src/components/editor/inline/editor-tokens.css` 의 `.editor-line*` 4종만 쓴다
  (전환 100ms / editing 배경 / focused 1px 액센트 링 / 자동 렌더 200ms 플래시). 일회성 클래스를 흩뿌리지 말 것.

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
- Docker local 개발은 workspace root `../.scripts/todo/compose.yml` 로 API와
  함께 실행한다. Web은 host `127.0.0.1:3030` → container `0.0.0.0:3034`,
  browser-facing API/socket 기본값은 `http://localhost:20022` 이다.
- production 검증 기준은 `npm run build` 이다.
- 독립 배포 시 Docker build 는 `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_SOCKET_PATH`, `NEXT_PUBLIC_LIVEKIT_URL` 을 build arg 로 주입해 생성한다.
- production app compose는 두지 않는다. workspace root
  `../.scripts/deploy-todo-prod.sh` 가 `.env.build`를 읽어 pull/build/rm/run하고,
  `teddy-infra`와 `restart: unless-stopped`를 적용한다.
- `NEXT_PUBLIC_*` 값은 browser bundle에 공개된다. 운영 값은 browser-reachable
  HTTPS/WSS URL 또는 same-origin 경로여야 하며 Docker service/container hostname을
  사용하지 않는다. 비밀 값은 넣지 않는다.
- root compose 제거 이후에도 API, socket, LiveKit 대상은 이 repo 의 public env 값으로 교체한다.
- infra 의 실제 호스트는 root infra compose 또는 운영 환경이 제공한다. 이 frontend repo 는 host 값을 직접 고정하지 않는다.

## Security

- Do not store auth-api access tokens or refresh tokens in localStorage/sessionStorage.
- Use `credentials: "include"` for session-backed API calls.
- Any public read behavior must be explicitly designed in a separate plan; do not expose non-Teddy-authored data through beer-house compatibility work.
