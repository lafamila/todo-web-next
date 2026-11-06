---
status: COMPLETED
completed_at: 2026-11-06
summary: "이미지 edge resize와 hover alignment UI"
---

Canonical: `../../../.idea/completed/TODO_IMAGE_EDGE_LAYOUT_PLAN.md`

기존 AttachmentImageBlock/토큰/라인 history·lease 경로를 재사용한다. slider와 너비 버튼은 제거하고
edge drag+hover 아이콘으로 대체한다. 저장 alignment를 inline/article/history 전체에 연결한다.
본문 width/align 보존·gesture 한 번 Undo·취소/권한 회수/좁은 폭·키보드 접근을 확인한다.
tests/lint/tsc/native browser/visual/build 후 커밋. API/env/deps/Docker 변경 없음.
CLAUDE/README/next-env/.gitignore/manifest의 기존 사용자 변경은 별도 보존한다.

완료:111tests/lint/tsc/native build/diff 통과. 1200ms grant 지연 첫 drag 재생, 단일 Undo/Redo,
양쪽 고정 edge 추적/취소·100% 숨김·정렬 저장/reload·history readonly·구형 portrait 비율 확인.
390px/10%에서도 toolbar와 다음 문장 비중첩, PC/mobile visual97, 최종 코드 리뷰 APPROVE.
repo CLAUDE 갱신, root 구조/포트/env/API 영향 없음. 새 dependency/Docker 변경 없음.
next-production 이전 결과를 staging 후 빌드 성공에 따라 정리하고 최신 결과만 유지했다.
