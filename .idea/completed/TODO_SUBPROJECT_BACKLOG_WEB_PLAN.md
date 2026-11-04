---
status: COMPLETED
summary: "Todo 계층 sidebar·초대·이동·백로그 오버레이·전체화면·삭제 UX 구현"
---

# Todo hierarchy/backlog — Web execution plan

Canonical: `../../../.idea/completed/TODO_SUBPROJECT_BACKLOG_PLAN.md`

## Repo Responsibility

7개 요청의 화면/동작, API contract/types, 독립 편집기/shortcut 경계, 모바일/시각 QA. 기존 흑백 디자인과 저장 안정성을 보존한다.

## Inputs / Dependencies

root 계약 확정: 첫 자식은 기존 메모와 멤버 권한 복사, 상위는 아코디언 전용 그룹(본문/백로그 없음). root의 API/Web 공통 계약을 따른다. 모든 결정 확정, 실행 가능.

## Work Items

1. ProjectSection long press 메뉴: pointer/touch cancel·스크롤·일반 클릭 구분, 키보드 접근 가능. 자식 생성/삭제 메뉴는 적절한 권한에만 노출.
2. 아코디언·한 단계 들여쓰기·자식 제목/아이콘·선택. 아이콘-only 폭에서 자식 감추기, 모바일 드로어 및 기존 resize 정렬 유지.
3. 루트 멤버 초대 모달에서 현재 자식 전체/선택 범위, 자식 단독 초대, 미래 자식 비상속 설명.
4. owner만 형제 자식으로 메모 이동, 실패/경합 메시지, 선택/목록 갱신 및 dirty draft 유지.
5. 백로그는 기존 MemoSection/InlineEditor 전체 기능 재사용하되 편집기 대상과 상태를 분리. 전역 selectedMemo를 바꿔 main을 대체하는 구현 금지.
6. 우측 edge hover handle과 접근 가능한 모바일/키보드 진입, 절반 폭 오버레이/drag resize. 백로그 열기 CmdCtrlShiftS, 활성 editor 저장 CmdCtrlS. 최신 본문 저장 성공만 닫기, 실패/충돌/대기 유지.
7. CmdCtrlEnter fullscreen 토글. 두 editor와 Monaco/IME 이벤트 경합 차단.
8. 정확 이름 입력 후만 삭제 활성화, API도 검증. 삭제로 접근 불가한 현재 선택/오래된 응답/소켓 상태 정리, 로컬 미저장 초안 보존.
9. 도움말/CLAUDE.md/API 타입/테스트 반영. README/next-env 사용자 변경 보존.

## Acceptance Criteria

- root 완료 증거 매트릭스 전 항목의 browser evidence. desktop/mobile/sidebar collapsed/fullscreen/backlog 동시 편집 모두 확인.
- npm test, lint, tsc, production build. 테스트는 native web + isolated API, 실사용 DB 내용 변경 금지.
- 새 백로그에 표/코드/체크/Raw/IME/durable recovery/CAS/lease가 동일하게 작동. main buffer가 백로그 저장/닫기로 바뀌지 않음.

## Report Back To Orchestrator

변경 파일, API 계약 영향, 테스트/시각 증거, 남은 위험. 소유 파일 경계와 공유 편집기 변경은 사전 조율. 커밋/push는 root 조율.

## Decision Escalation

root 결정 gate 통과. 새로운 권한/데이터 노출 UX는 임의로 확정하지 않고 보고.

## 완료 검증 (2026-11-04)

- 최종 npm test 72/72, lint/tsc/build/diff-check 통과. 임시 native API/web 및 QA 브라우저 종료.
- 실제 UI: long press와 이동 취소, 아코디언/24px 들여쓰기/아이콘 숨김, 전체/선택 초대 및 미래 자식 비상속, owner만 이동/삭제, 정확 이름 확인, 모바일390px overflow0.
- 기존 일반 메모와 백로그 ID/본문/버전/역할 보존, CmdEnter 왕복, 백로그640/1280 초기 폭과 실제 drag440px/키보드resize, 모바일390px 표시 확인.
- 일반 메모 dirty 중 백로그 열기/독립 저장, 503동안 패널 유지 후200 닫힘, debounce 전 닫기/복구, 늦은 이전 저장 응답이 다시 연 패널을 닫지 않음을 확인.
- dirty 첫 자식 생성/형제 이동/deep-link 이동 모두 in-memory buffer 유지 및 실제 PUT200. stale 응답/URL 재적용 경합 차단.
- 실제 읽기 권한 회수는 본문/목록 즉시 숨김, dirty editor IndexedDB에 정확한 원문 보존. viewer 쓰기 거부는 읽기 유지.
- 기존 MemoSection/lease/CAS/draft 경로 재사용. 신규 의존성 없음. README/next-env 기존 변경 커밋 제외.
