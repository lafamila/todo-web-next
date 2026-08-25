---
status: COMPLETED
summary: "로컬 모드의 메모 본문 상단에서 과거 버전을 선택해 읽기 전용으로 보는 UI를 추가한다."
completed_at: 2026-08-25
completion_reason: "버전 선택·지연 조회·read-only/락 경합 방어를 구현하고 desktop/mobile smoke와 빌드를 통과했다."
---

# Local Memo Version Viewer — Web

## 변경

- 메모 본문 상단의 normal-flow 영역에 버전 선택 바를 둔다. 기존 헤더 상태·저장·동기화 UI와 겹치지 않는다.
- 과거 버전을 선택하면 현재 편집 버퍼를 보존한 채 인라인 렌더러를 읽기 전용으로 표시한다.
- 버전 보기 중에는 락 요청·저장·Raw 전환·체크박스 변경을 막고, 현재 문서로 돌아오면 기존 편집 흐름을 복원한다.
- `/api/session/me.features.memoVersionHistory`가 참일 때만 렌더한다.

## 검증

- TypeScript, ESLint, production build
- dev-local mock data에서 버전 선택/읽기 전용/현재 복귀 브라우저 smoke
- dev-prod에서는 버전 UI 미노출 확인
- 데스크톱·모바일 스크린샷 visual verdict 90점 이상
