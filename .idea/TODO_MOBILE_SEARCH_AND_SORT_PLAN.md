---
status: COMPLETED
summary: "모바일 검색창 상시 노출, 모달 최상위 표시, 메모 최신순 기본 정렬"
---

# 모바일 사용성 및 기본 정렬

- 기존 useIsMobile(768px) 기준으로 검색창 상시 표시. 모바일 빈 입력 blur/결과 선택/프로젝트 전환 후에도 표시·입력 가능. 데스크톱의 단축키/1초 숨김 동작 유지.
- 공통 Modal z-index를 메뉴1001·전체화면1200보다 높은1300으로 배치.
- 기본 생성일 정렬은 내림차순(최신 먼저). 다른 날짜 기준 선택도 내림차순으로 시작, 이름은 오름차순, 같은 기준 재클릭 시 토글.
- API 및 데이터 변경 없음. 기존 README.md/next-env.d.ts 미커밋 변경 보존.

## 검증

- 390px에서 초기/빈 값 blur 1.3초 후 검색 표시, 프로젝트 전환과 desktop/mobile 폭 변경 확인.
- 도움말 모달 표시 중 메뉴 버튼 좌표의 elementFromPoint가 모달/백드롭을 가리킴.
- 서로 다른 생성일의 샘플 문서로 최신→오래된 기본 정렬 및 토글/다른 정렬 기준 검증.
- npm test, lint, typecheck 및 production build. 검증용 native 서버만 종료.

## 검증 결과

- 모바일 390px에서 초기/빈 blur 1.35초 뒤 hidden=false/inert=false/opacity=1. 프로젝트 전환 후에도 표시.
- 데스크톱으로 넓힌 뒤 빈 검색창 자동 숨김 유지.
- 도움말 모달 z1300 > 메뉴 z1001; 메뉴 중앙 좌표의 elementFromPoint가 모달 내부를 가리킴.
- 날짜가 다른 샘플 6개가 기본 생성일 desc, 토글 asc, 최근편집 선택 시 updated desc로 정렬됨.
- 테스트38개, ESLint, TypeScript, production webpack build 통과. 변경 diff 검토 통과.
- 이번 검증의 샘플 API20125/native Web30335/브라우저 세션 종료. API/DB 변경 없음.
