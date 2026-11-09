---
status: COMPLETED
completed_at: 2026-11-09
summary: "단일 메모 이동 버튼·모달 제거"
---

Canonical: `../../../.idea/completed/TODO_BULK_ONLY_MEMO_MOVE_PLAN.md`.
MemoListSection의 single move 전용 import/destructure/state/handler/row button/modal 제거.
bulk 이동과 이름 확인은 그대로 유지한다. AppContext/API는 사용하지 않는 경로까지 임의 삭제하지 않는다.
기존 unit/lint/tsc/build와 실제2-subproject/다중선택 이동/PC·mobile 시각 회귀를 통과한 뒤 commit/push한다.

완료:123 tests/lint/tsc/native build/diff 통과. Row button2→0, bulk toolbar/양쪽 이름 확인/실제 두 메모 이동과
ID·본문·편집시각 보존 확인. Mobile390px overflow0/visual98. source83줄 삭제 외 bulk/API 변경 없음.
CLAUDE 반영, root 구조/env/dependency 영향 없음. 최신 성공 .next만 유지, own QA 자원 정리.
