---
status: IN_PROGRESS
summary: "충돌·중복 항목을 목록에서 흐리게 표시하고, 열면 즉시 좌우 분할로 해소하는 화면과 동기화 상태 표시를 만든다."
---

# TODO OFFLINE SYNC — todo-web-next execution plan

Canonical orchestration plan:

`../.idea/TODO_OFFLINE_SYNC_PLAN.md`

전체 구조와 동기화 규칙은 root plan 을 본다. 이 문서는 화면 쪽 작업만 다룬다.

## Repo Responsibility

동기화가 만든 상태를 **사용자가 알아채고 해결할 수 있게** 만든다. 동기화 로직·스키마·데몬은 `todo-api-fastapi` 소유이고 이 레포는 그 API 를 소비한다.

핵심 원칙: **별도 동기화 화면으로 보내지 않는다. 문제가 있는 항목 자체에서 해결한다.**

## Inputs / Dependencies

- `todo-api-fastapi` 가 보고하는 API 계약 (이것 없이 시작하지 않는다):
  - `GET /api/sync/issues` — `sync_issues` 응답 스키마 (`kind`: `conflict | duplicate_project | duplicate_memo | identity | schema`, `refTable`, `refId`, `peerRefId`, `detail`, `detectedAt`, `resolvedAt`)
  - `GET /api/sync/status` — `lastOkAt`, `pending`, `paused`, 이슈 요약
  - `GET /api/memos/{id}/versions`, `GET /api/memos/{id}/versions/{version}` — **이미 존재하지만 프론트에 호출부가 없다**(`src/lib/api.ts` 확인됨). 이번에 추가한다.
  - `POST /api/memos/{loserId}/merge-into/{winnerId}`, `POST /api/projects/{loserId}/merge-into/{winnerId}`
  - 실시간 이벤트 payload — 원격 pull 출처 표시, 대상 메모 id, 새 `updated_at_utc`
- 기존 자산: `MemoSection`(인라인 에디터 호스트), `MemoListSection`(Task 목록), `useMemoSocket`, `src/components/editor/inline/`(줄 기반 문서 모델 `EditorLine`)

## Work Items

### 1. 문제 항목 표시

1. **Task 목록에서 충돌·중복 항목의 제목을 살짝 흐리게** 표시한다. 정상 항목과 한눈에 구분되지만 시선을 빼앗지 않는 정도(색/투명도만 — 아이콘·배지를 덧붙이지 않는다). 근거는 `sync_issues` 의 미해결 행이다.
2. 프로젝트 사이드바에서도 중복 후보 프로젝트 이름에 같은 처리를 적용한다.
3. 시각 처리는 기존 디자인 시스템 안에서 정의한다 — 일회성 클래스를 흩뿌리지 말고 `todo/global.css` 또는 `editor-tokens.css` 에 토큰 1개를 추가한다 (원칙 9).
4. 해소되면(`resolved_at` 채워짐) 흐림이 사라진다.

### 2. 충돌 해소 — 좌우 분할

5. 흐린 task 를 클릭해 메모를 열면 **즉시 좌우 분할** 해소 화면을 띄운다 (평소 에디터 대신). 왼쪽 현재값, 오른쪽 보존된 충돌 버전.
6. **줄 단위 diff** 를 강조한다. 인라인 에디터가 이미 줄 기반 문서 모델을 쓰므로 LCS 한 번으로 구현되고 외부 의존성이 필요 없다. 공통 줄/추가/삭제/변경을 구분한다.
7. 액션 3개: **현재 유지** / **보존 버전으로 교체** / **직접 병합해서 저장**(편집 가능한 병합 텍스트 → 저장하면 그것이 현재값, 원본 둘은 버전으로 남는다).
8. 해소 저장 시 이슈를 해결 처리하고 분할 화면을 닫아 평소 에디터로 돌아간다.
9. 충돌이 여러 건이면 순서대로 처리할 수 있게 한다(다음 충돌로 이동).

### 3. 중복 해소 — 좌우 병합

10. 흐린 중복 항목을 열면 같은 좌우 화면에서 **생존자를 고르고** 병합한다. 메모는 양쪽 내용을, 프로젝트는 양쪽의 메모 수·생성시각을 보여준다.
11. 병합은 `merge-into` 호출로 수행한다. 병합 결과로 패자 내용이 생존자의 버전으로 합쳐진다는 점을 화면에서 알린다.
12. **오프라인이면 병합을 잠근다** — 원격에서 실행해야 하므로 "온라인에서 정리" 안내를 띄우고 버튼을 비활성화한다.

### 4. 편집 중 원격 변경 보호

13. 현재 `MemoSection` 의 소켓 핸들러는 `onContentUpdated` 에서 `setContent(newContent)` 로 **에디터 내용을 그대로 갈아치운다**. 노드 간 락이 없으므로 실시간 pull 이 타이핑 중 내용을 날릴 수 있다.
14. 대상 메모를 편집 중(활성 라인 있음 또는 미저장 변경 있음)이면 **버퍼를 덮지 않는다**. 대신 상단에 "원격에서 이 메모가 변경됨 — 비교" 배너를 띄우고, 클릭하면 좌우 분할 화면으로 연결한다.
15. 편집 중이 아니면 기존처럼 즉시 반영한다.
16. 온라인 락 위임이 적용되면 이 상황은 드물어지지만, 오프라인 편집 뒤 복귀 시나리오에서 여전히 발생하므로 **필수 항목**이다.

### 5. 동기화 상태 표시

17. 헤더에 작은 표시 하나: 마지막 동기화 시각, 대기 건수, `paused`, 중단 사유(신원/스키마/시계 편차). 클릭하면 상세를 펼친다.
18. 오프라인일 때 그 사실이 드러나야 한다(작업이 로컬에만 있다는 신호).
19. 이 표시는 상태 전용이다 — 항목별 해소는 1~3번 경로가 담당한다.

### 6. API 클라이언트

20. `src/lib/api.ts` 에 추가: `getSyncStatus`, `getSyncIssues`, `getMemoVersions`, `getMemoVersion`, `saveResolvedContent`(기존 메모 저장 재사용 가능하면 재사용), `mergeMemo`, `mergeProject`.
21. 타입은 `src/lib/types.ts` 에 정의하고 API 응답 필드명(camelCase)을 그대로 맞춘다.

### 7. 문서

22. repo `CLAUDE.md` 의 **Memo Editor** 섹션에 추가: 흐림 표시 규칙, 좌우 해소 화면, 편집 중 버퍼 보호(이유 포함 — 소켓 수신이 버퍼를 덮는 기존 동작이 왜 위험한지), 동기화 상태 표시.

## Acceptance Criteria

- `npm run lint`, `npm run build` 통과.
- 목록에서 충돌/중복 항목만 흐리게 보이고, 해소 후 흐림이 사라진다.
- 흐린 task 클릭 → 좌우 분할이 즉시 열리고, 줄 단위 diff 가 실제 차이와 일치한다.
- 세 액션(현재 유지 / 보존 버전으로 교체 / 직접 병합 저장)이 각각 의도한 결과를 만들고, 원본 둘이 버전 목록에 남는다.
- 중복 병합이 온라인에서 동작하고, 오프라인에서는 잠기며 안내가 보인다.
- **편집 중 보호 검증**: 메모를 열어 타이핑 중인 상태에서 원격 변경이 도착해도 입력 내용이 사라지지 않고 배너만 뜬다. 편집 중이 아니면 즉시 반영된다.
- 헤더 표시가 온라인/오프라인/일시정지/중단 4상태를 구분해 보여준다.
- 기존 UX 회귀 없음: 단일 클릭 편집 진입, 드래그 선택 → Raw 모드 승격, Cmd+Enter 전체화면, 정렬·다중선택.

## Report Back To Orchestrator

- `todo-api-fastapi` 계약에서 부족했던 필드(해소 화면에 필요한데 응답에 없는 것).
- 좌우 분할 화면이 기존 레이아웃(탭 분할·전체화면·pane resizer)과 충돌한 지점과 해결 방식.
- 디자인 토큰 추가 내역.
- 남은 위험: 흐림 표시가 다른 상태 표시(잠김·비밀 프로젝트)와 시각적으로 혼동될 여지.

## Decision Escalation

사용자가 결정해야 하는 주요 사안은 임의로 판단하지 않는다. 작업을 중단하고 현재 orchestrator 에게 전달해 결정받은 뒤 진행한다. orchestrator 에 보고할 수 없으면 workspace root `../.idea/` 에 handoff 문서를 남긴다.

특히 다음은 임의로 정하지 않는다:

- 해소 UI 를 별도 화면(`/todo/sync`)으로 옮기는 선택 — 항목에서 해결하는 방식으로 확정되어 있다
- 자동 병합(사용자 확인 없이 최종본 결정)
- 기존 저장 계약(⌘S 만 저장, 자동 저장 없음) 변경
