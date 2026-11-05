---
status: COMPLETED
summary: "백로그 토글·Esc 두 번 닫기·작은 상태 표시와 패널 비율 로컬 저장"
---

# 백로그 단축키와 레이아웃 설정

- Cmd/Ctrl+Shift+S는 열기/닫기 토글. 일반 CmdS 저장과 분리, 키 반복/IME는 무시.
- 열린 백로그에서 연속된 Esc 두 번으로 닫는다. 첫 Esc는 기존 인라인/Monaco/Raw 편집 종료를 허용하고, 다른 키/포인터 동작/새 세션은 카운트를 초기화한다. 열린 모달의 Esc는 카운트하지 않는다.
- 백로그 상태 글자는 기존의0.6배, 닫기와 간격 확보. 닫기 버튼은 모바일만, 기존 저장 성공 닫기/전환/기기초안 보존 유지.
- backlog 너비는 viewport 대비, 메모 목록은 실제 main grid 폭 대비 비율을 localStorage에 저장한다. 자동 resize/mobile 표시가 저장된 선호 비율을 덮지 않게 한다.
- 기존 todo:tasksPaneWidth 픽셀 값은 새 비율이 없으면 현재 grid 폭 기준으로 한 번 이관한다. 좁은 화면에서는 메모 영역 최소240px과 기존 패널 최소폭을 지키되 저장 비율 자체는 유지한다.
- 저장소 차단/잘못된 값은 기본 크기로 안전하게 처리. 새 API/DB/env/dependency 없음. README/next-env 기존 변경 보존.
- 검증: 단축키와 Esc(반복/IME/모달), draft 유지, 상태font0.6/간격/버튼desktop/mobile, 두 실제 resize 후reload·프로젝트전환·viewport/mobile 왕복 비율 복원, unit/lint/tsc/build/browser.

## 소유권

- backlog 담당: BacklogPanel, MemoSection, backlog CSS/정책·테스트.
- root: panelLayout 비율/저장 helper 및 tests, MemoListSection, package/CLAUDE/통합 native QA·커밋/push.

## 완료 검증 (2026-11-05)

- node tests81/81, tsc/lint/build/diff-check 통과. 최종 비동기·초안·레이아웃 리뷰 APPROVE.
- 실제 단축키: CmdShiftS 다시 누르면 닫힘. 첫Esc에서 line edit종료/panel유지, 두번째Esc후animation닫힘. repeat chord 기본동작 차단/panel유지.
- PC close display none, 모바일 save/close표시, status0.6em 및8px gap. desktop/mobile 시각97/pass.
- 실제 drag: 목록520/1196=.4347826, backlog480/1280=.375. reload후520/480복원, window1600에서652.17/600, window2000에서817.39/750. 모바일390왕복/프로젝트전환후저장비율유지.
- 기존픽셀값 이관/잘못된설정/저장소차단 단위검증. 자동clamp는저장값을덮지않음.
- dirty Esc닫기→복구대기→선택없이닫기→재열기→reload에서 exact IndexedDB 초안유지. 현재 editor가 직접쓴revision만clean정리하도록 수정해 기존삭제경로차단. 복구 후실제PUT200/닫힘확인.
- Native QA API/web/browser는 이번 세션이 시작한 프로세스만 종료. API/DB/schema/env/dependency 변경 없음. 기존 README/next-env보존. 실제NAS/prod-local Docker재빌드없음.
