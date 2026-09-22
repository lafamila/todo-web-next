---
status: COMPLETED
summary: "Unicode 상자 문자 표를 원문 보존 상태로 HTML 표로 표시"
---

# 상자 문자 표 렌더링

2026-09-22 사용자가 실제 구현을 요청했다. 원문 보존형 표 렌더링을 구현한다.

- `parseContent`와 `buildLineGroups`는 코드펜스 외 본문을 줄 단위로 처리한다. remark-gfm은 `┌─┬│` 상자 문자 자체를 표 문법으로 인식하지 않는다.
- 공유 순수 파서로 시작/끝 테두리와 여러 `│` 데이터 행을 묶으면 한글·영문 너비 계산 없이 셀을 구분할 수 있다.
- 사용자 예시의 정상 헤더·11번 행은 4열이며, 중간의 잘린 `───┼───┤` 구분선은 검증된 표 구간 내부에서 테두리 문자만 있는 장식 줄로 판단하여 표시에서 제외할 수 있다.
- 데이터 행의 셀 자체가 빠졌거나 `│`가 본문인지 경계인지 모호하면 내용을 추정하지 않고 원문으로 fallback한다.
- 원본 `EditorLine.text`, 저장 문자열, 버전·동기화 데이터는 바꾸지 않는다. 화면에만 `<table>`을 표시하고 편집 시 원문/Raw 모드로 진입하는 방식을 권장한다.
- 코드블록 안의 상자는 코드로 유지한다. 스프레드시트처럼 셀을 직접 편집하는 기능은 별도 범위다.

## 예상 구현 범위

- Web의 공유 parser, ContentBlockInterface, parseContent, buildLineGroups/groupsToBlocks, InlineEditor, ContentBlocks 및 표 CSS.
- 게시글 ArticleDetail과 read-only 버전도 동일 렌더러를 공유한다.
- `data-line-id` 기반 선택/Raw 전환, undo/redo, 원문 왕복 불변식 회귀 확인 필요.
- API/DB schema 및 저장 데이터 변환 불필요.

## 필수 검증

사용자 예시, 한글/긴 셀/빈 셀, 손상된 구분선, 잘못된 데이터 행, 코드펜스 내부, 앞뒤 일반 문장, 원문 byte 동일 왕복, 편집/게시/버전 화면 일치.

## 구현 계약 및 담당

- readBoxTable(lines,startIndex) → {table,endIndex} | null, endIndex는 exclusive.
- BoxTableData: columnCount, headerRowCount, rows[{cells:string[],lineOffset:number,cellOffsets:number[]}]. offset은 원문 UTF-16 column, lineOffset은 표 시작 기준.
- parser 담당: boxTable.ts/tests, utils.ts, types.ts, classifyLine.ts. 코드펜스 우선·불완전 표 fallback, 편집 가능 line id 및 양쪽 renderer parity 유지.
- root 담당: 공통 BoxTableBlock, ArticleDetail, InlineEditor/LineView 표 표시·원문 편집·선택 offset, CSS, 브라우저 검증/문서/배포.
- 셀 직접 편집 대신 표의 셀 또는 '표 원문 편집'으로 해당 원문 줄을 편집한다. 읽기 전용 버전에는 편집 진입을 제공하지 않는다.
- 신규 의존성/API/DB 변경 없음. 기존 미커밋 README/next-env.d.ts 유지.
- 완료 기준: parser 회귀 및 기존 tests, lint/typecheck/production build, 실제 브라우저 편집/버전/게시 렌더·모바일 overflow·원문 보존 검증.

## 검증 결과 (2026-09-22)

- 단위 테스트 57/57 통과 (표 parser 10개), lint, TypeScript, diff whitespace 검증 통과.
- npm run build 통과: Next.js production compile/typecheck/static pages 10개 생성 완료.
- 격리된 in-memory API + 실제 Socket.IO lease/PUT 경로를 이용한 native browser QA. 실제 사용자 DB는 수정하지 않았다.
- 사용자 예시의 4열/헤더/본문 표시, 잘린 장식선 생략, 최초 표시 시 PUT 0회.
- 셀 클릭 시 해당 원문 줄 UTF-16 column 8로 진입. 내용 변경 없이 저장 시 원문 동일·PUT 0회.
- '디자이너 영역'만 수정 후 저장: 원본에서 해당 부분만 치환한 문자열과 서버 본문 완전 일치·PUT 1회.
- 여는 ┌ 삭제로 표가 불완전해져도 동일 textarea DOM/focus 유지. 브라우저 native undo 후 표 복귀.
- 렌더 셀 사이 선택 → Raw 선택 start 791/end 818: 원문 공백·│ 포함 예상 선택 문자열과 일치.
- 과거 버전의 10번 행 표시, 편집 버튼 없음. 현재 11번 행으로 복귀. 공개 게시글도 4열 표·편집 버튼 없음.
- 코드펜스에 넣은 동일 예시는 Monaco 1개·표 0개로 코드 원문 유지.
- 모바일 390px: page scrollWidth 390, 표 viewport 372/table width 512. 표만 가로 스크롤.
- 독립 코드 리뷰 APPROVE, 구체적 blocker 없음. 브라우저/임시 native API·web 프로세스 종료.

## 문서·배포 영향

- repo CLAUDE.md에 표 문법·공유 parser·원문 편집/선택 보존 계약 반영, 도움말에 표 문법 추가.
- root CLAUDE.md/레지스트리/API/DB/인증/환경변수 변경 없음. 신규 의존성 없음.
- 기존 parser/renderer를 확장해 메모·게시글·버전의 중복 판정/표시를 피했다.
- Dockerfile/env/README의 기존 독립 배포 계약 점검, compose config --quiet 통과.
- Docker 재빌드·운영 반영은 이번 기능 추가 요청 범위에서 실행하지 않았다.
- 기존 사용자 README.md/next-env.d.ts 변경은 보존하며 기능 커밋에서 제외한다.
