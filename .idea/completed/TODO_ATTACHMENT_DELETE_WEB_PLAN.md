---
status: COMPLETED
completed_at: 2026-11-05
summary: "선택 메모 작업 우측 내용 영역 복원·본인 첨부 모달 선택 삭제"
---

Canonical: `../../../.idea/completed/TODO_ATTACHMENT_DELETE_SELECTION_PLAN.md`

## Repo Responsibility / Work Items

원래 right content multi-selection actions 복원, 미저장 buffer/lease/history를 가능한 한 유지한다.
모달 삭제 본인/선택 matrix, history mutation 금지, 삭제 확인과 loading/error/count/list 정리.
늦은 GET에 의한 삭제 항목 부활/다른 메모 stale callback 방지, 다운로드 일반 멤버 유지.

## Acceptance Criteria / Report Back

tests/lint/tsc 및 root native browser/visual/build. API wire root plan 준수, 새 env/dependencies 없음.
README/next-env/다른 변경 보존. source 담당파일만 변경, 서버/컨테이너/build/commit은 root.

완료:107/107 tests, lint/tsc/Next production build/diff 및 최신 security/state review APPROVE.
native 선택우측복원·dirtycancel·이름확인/본인파일삭제·혼합금지/confirmation reset/busy/
A→B→A journal/일반멤버다운로드/비-super uploader 삭제/history readonly 검증. PC/mobile visual96.
기존 큐·모달·selection UI 재사용, 새 env/deps 없음. R2 원본 보존 metadata 삭제임을 UI/문서에 명시.
