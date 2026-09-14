---
status: COMPLETED
summary: "TODO 버튼의 흑백 디자인을 통일하고 검색창을 편집기 열에 정렬한다."
---

# TODO monochrome controls and editor-aligned search

- 공통 토큰: primary #171717/white, neutral border/text, control height 34px, button radius 4px. 버튼 색상은 흑백, semantic status만 red/green/blue.
- Tasks: 화면공유·멤버 관리 버튼을 동일 class/높이로 맞추고 멤버 아이콘을 currentColor SVG로 변경.
- 게시·게시취소·모바일 저장·동기화 요약 및 공유 상태 버튼을 공통 흑백 스타일로 정리. TODO 내 버튼 radius 통일(편집기 내부 Monaco 자체 UI는 제외).
- 데스크톱 검색창의 x 좌표는 .detail의 본문 inset(10px)을 기준으로 정렬. 부모 main-container의 실제 Tasks track을 subgrid로 공유하여 리사이즈를 따라감. 최대폭 700px, 우측 액션을 제외한 가용 공간에서 축소.
- 검색 input/dropdown/highlight를 중립색으로 맞춤. 표시/숨김은 180ms opacity/translate 애니메이션, reduced motion 지원. 숨김 진입부터 inert/aria-hidden, 전환 완료 뒤 hidden 적용.
- 기존 한글 debounce, 키보드 탐색, blur 1초 지연 숨김 유지.

## 검증 기준

- 브라우저: Tasks 버튼 높이·색·radius/아이콘 흰색, 게시·상태 버튼 neutral 및 status dot 확인.
- Tasks 폭 264/400/600px에서 search left와 editor content left 일치, 넓은 화면 max700 및 좁은 화면 shrink. 모바일 가로 overflow 없음.
- 검색 show/hide 시 중간 프레임과 완료/재진입 포커스, 한글 조합 검색, reduced motion 확인.
- npm test, lint, tsc, production webpack build; 사용자 README/next-env 기존 dirty 보존.
- dev-local/dev-prod HTTP 정상 응답. 이번 작업이 만든 native 테스트 프로세스만 종료. 커밋 후 prod 배포는 별도.

## 검증 결과 (2026-09-14)

- 공유/멤버/게시/동기화 버튼 실측 높이 34px, radius 4px. 공유·멤버 배경 rgb(23,23,23), 글자/아이콘 rgb(255,255,255).
- Tasks 264/400/600/760px에서 search/editor x 좌표 차이 0px. 실제 마우스 드래그로 264px 변경 후에도 x=348px로 일치.
- 1920px 화면 검색 폭 700px. 900px 화면에서는 Tasks를 580px로 제한하고 편집기 240px을 남김; 검색 width220px, header80px 안에 두 줄 배치. bodyWidth900px.
- 390px 모바일 dropdown x8/width374px, 가로 넘침 없음. 모바일 게시·저장은 밝은 중립 테두리로 경계 확인.
- 검색 entry 중간 opacity0.15, exit 중간 opacity0.915/inert=true, exit 중 재포커스와 최종 hidden 확인.
- reduced-motion 실제 Chrome emulation에서 animation:none/transition:0s, 1초 대기 뒤 추가 180ms 없이 hidden 확인.
- container stacking context 때문에 헤더에 position:relative/z35를 부여. 최종 브라우저 elementFromPoint로 본문 위 결과가 실제 클릭 대상으로 잡히는 것 확인.
- 테스트38개, ESLint/TypeScript, production webpack build 통과. 빌드 뒤 마지막 헤더 z-index 보정은 CSS parser 및 native Next 브라우저에서 추가 검증.
- 최종 리뷰 APPROVE. 샘플 API20125/native Web30335/이번 브라우저 세션 종료, 실제 dev-local30333/dev-prod30334 모두 HTTP200 확인.
- 기존 README.md/next-env.d.ts 변경 보존. API/DB/env 변경 없음. visual verdict는 workspace .omx/state/todo-monochrome-header/ralph-progress.json.
