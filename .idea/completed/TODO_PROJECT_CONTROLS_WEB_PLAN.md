---
status: COMPLETED
summary: "프로젝트 메뉴·정렬·rename·다중 이동과 백로그 responsive 전환 UX"
---

# Web 실행 계획

Canonical: `../../../.idea/completed/TODO_PROJECT_CONTROLS_REFINEMENT_PLAN.md`

## Repo Responsibility

프로젝트와 backlog 두 명확한 파일 소유권으로 root 계약 8항 구현.

## Work Items

1. ProjectTree 제목 좌측/우측 동일선 메뉴/접힌 경우만 아래 삼각형, 메뉴 열림 동안 sidebar 확장, New Project좌측.
2. 프로젝트 rename 모달/API/state, 다중선택 이동 source/target 이름확인 모달/API/state. dirty selection 보호.
3. BacklogPanel close 전환 상태, desktop 우측/mobile하단 slide, reduced-motion. MemoSection backlog ? 제거, desktop save 숨김/mobile 유지, 상태 우측, 메인 도움말 shortcut.
4. 정책 테스트/시각 검증/문서 갱신. 기존 README/next-env 보존. no new dependency.

## Acceptance Criteria

root 계약의 native browser desktop/mobile 확인, Web tests/lint/tsc/build, 실제 API 연동 rename/bulk move, stale응답/dirty draft/닫기중입력/재열기 검증.

## Report Back To Orchestrator

파일 소유권 준수, API/export/CSS 통합 경로, 테스트 및 screenshot, 남은 위험. 자체 commit/push 금지.

## 완료 증거 (2026-11-05)

- Web76 tests, lint/tsc/production build/diff-check 통과.
- 실제 sidebar메뉴 x desktop299/mobile287 동일, 제목/New Project left, 열린그룹 표시 없음/접힌그룹 ▼, pointer외부 menu-open 확장320px 유지.
- rename200 즉시 목록/제목 반영. source/target 정확 이름 확인/복수 이동/선택·dirty buffer 유지 후PUT200. 선택중 편집기 unmount 없음.
- backlog desktop열림/닫힘X전환, mobile열림/닫힘Y전환, closing DOM/inert 유지 후제거, desktop[닫기]/mobile[저장,닫기], 저장 상태 상단만1회, 390px overflow0. 도움말 backlog shortcut 존재.
- visual-verdict97/pass. README/next-env 기존 변경 보존. QA 프로세스 종료 후빌드, 실제 NAS/로컬 Docker 재빌드 없음.
