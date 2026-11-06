---
status: COMPLETED
completed_at: 2026-11-06
summary: "Undo와 버전 복원·원격 초안 retirement 통합 수정"
---

Canonical `../../../.idea/completed/TODO_UNDO_VERSION_REMOTE_PLAN.md`; 세부 `.omx` root spec/plan 참조.
Web executor가 source/tests를 단독 수정한다. 최소 회귀로 native/custom history 오류·다른 줄 boundary·D1/lineage
retirement·server revision 변화·late retry를 고정하고 실제 입력 검증은 root가 수행한다.
단축키 Cmd/Ctrl+Alt+Z는 기존 Undo/Redo와 분리, 과거 버전은 명시 restore만 저장한다. 기존 auth/lease/CAS 유지.
unit/lint/tsc/native build/browser/review/visual 통과 후 완료. 기존 README/next-env는 포함하지 않는다.

완료:123 unit/lint/tsc/native build/diff 통과, 최종 코드 리뷰 APPROVE,4phase16 native behavior PASS.
실제 lease0→650ms grant 중 Undo2회, Raw/Monaco/저장 ACK, 두 플랫폼 version키·focus·명시 CAS restore,
D1+D0 retirement/재시작/서버변경/새 local revision/다른 계정 보존,503·late committed PUT 검증.
PC/mobile visual97,390px overflow0. CLAUDE 반영, 새 dependency/env/API/DDL/Docker 변경 없음.
기존 성공 .next를 staging 후 새 성공 결과만 유지했고 own 테스트 프로세스/DB는 root가 정리했다.
