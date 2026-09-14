---
status: COMPLETED
summary: "한글 실시간 검색과 검색창 표시 수명을 수정하고 화면공유 버튼을 Tasks 액션으로 이동한다."
---

# 프로젝트 검색 한글 IME 수정

- 원인: 검색 effect가 isComposing 동안 return하여 마지막 한글을 Enter로 확정해야 요청이 발생한다.
- 입력 value 변경에만 기존 220ms debounce를 적용하고 조합 상태는 키보드 선택 보호에만 사용한다.
- compositionend의 최종 value도 반영하되 값이 같으면 완료된 검색을 무효화하지 않는다.
- event.isComposing, synchronous composition ref, Safari keyCode 229로 Enter/방향키 조합 입력 보호.
- 서버 API와 편집기 자체의 IME 계약은 변경하지 않는다.
- 검색창은 기본 숨김. Cmd/Ctrl+Shift+P로 표시·포커스, 값/포커스가 있으면 유지, 빈 값으로 blur 시 1초 뒤 숨김. 그 사이 다시 포커스하면 숨김 취소.
- 기존 화면공유 portal target을 Tasks 행 오른쪽, 멤버 관리 버튼 왼쪽으로 이동. feature flag/공유 동작은 유지.

## 검증 기준

- 브라우저: compositionend/Enter 없이 한글을 입력한 상태에서 결과 표시.
- 조합 중 Enter 및 keyCode 229 Enter로 메모 선택 안 됨, 조합 완료 뒤 일반 Enter로 선택됨.
- 기존 영어 검색/빠른 입력의 debounce와 오래된 요청 무효화 유지.
- 검색창의 초기 숨김/단축키 표시/포커스 유지/값 유지/빈 blur 1초/재포커스 취소와 좁은 화면 배치 검증.
- 화면공유 버튼과 멤버 관리 버튼의 순서·위치 및 local feature flag 유지 검증.
- npm test, lint, TypeScript, production webpack build 통과.

## 검증 결과 (2026-09-14)

- 수정 전 조합 종료 없는 한글 입력: 요청 0건/결과 0개 → 수정 후 요청 1건/결과 5개.
- 조합 중 Enter와 keyCode 229 Enter: 메모 조회 0건. 같은 값으로 compositionend 발생 시 검색 재요청 0건. 조합 종료 뒤 일반 Enter는 메모 상세로 이동.
- 기본 숨김/단축키 표시/빈 포커스 유지/blur 후 450ms 표시/재포커스 취소/blur 후 1150ms 숨김/값 있는 blur 유지 모두 브라우저 검증 통과.
- Tasks 액션 순서 `화면 공유 → 멤버 관리`, 데스크톱 및 390px 모바일에서 위치·가로 넘침 검증 통과. 실제 화면 공유 송출은 실행하지 않음.
- Web tests 38 passed, ESLint/TypeScript/webpack production build 통과.
- 시각 검증: workspace root의 .omx/state/todo-project-search-ime/ralph-progress.json.
- 이번 작업의 샘플 API(:20125), native Web(:30335), 브라우저 세션 종료. 기존 개발 스택은 유지.
