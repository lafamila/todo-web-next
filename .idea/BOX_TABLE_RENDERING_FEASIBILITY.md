---
status: PREPARED
summary: "Unicode 상자 문자 표를 원문 보존 상태로 HTML 표로 표시하는 기능의 가능성 검토"
---

# 검토 결과: 구현 가능, 현재 미지원

요청 범위는 가능 여부 확인이다. 이 문서는 검토 결과이며 실제 표 렌더링 코드는 아직 추가하지 않았다.

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
