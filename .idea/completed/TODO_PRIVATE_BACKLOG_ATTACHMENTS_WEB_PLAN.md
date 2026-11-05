---
status: COMPLETED
completed_at: 2026-11-05
summary: "개인 백로그·파일 선택 다운로드·클립보드 이미지 행과 즉시 미리보기"
---

# Web 실행

Canonical: `../../../.idea/completed/TODO_PRIVATE_BACKLOG_ATTACHMENTS_PLAN.md`.

## Repo Responsibility

기존 MemoSection/lease/CAS/draft/줄 모델 재사용. backend storage key를 브라우저에 노출하지 않는다.

## Work Items

- picker multiple + 업로드, 다운로드N toolbar/modal(전체선택)/single·ZIP blob download.
- 클립보드 image Files를 텍스트행 사이 stable attachment UUID token으로 삽입. objectURL preview/spinner→ready authenticated image, 오류retry, 메모 epoch가 바뀌면 새 본문에 반영 금지.
- image classifier/parser/renderer를 article/read-only에도 공유하되 비공개파일 접근은 API가 검증. code fence 안은 원문.
- 업로드중 저장/초안/Raw/IME/Monaco 및 이미지 blob reload 복원 방어. 계정별 backlog GET/POST는 root 통합.

## Acceptance Criteria

root browser 완료기준 + Web tests/lint/tsc/build/security+visual 검증. 새 의존성 없음. README/next-env 보존.

## Report Back

파일 소유권/API/type/export/스타일·테스트, pending/error/retry/초안처리와 남은 위험. commit/push는 root.

## 완료 검증

- 테스트 93/93, TypeScript, ESLint, Next production build 통과.
- 브라우저: caret 앞/이미지/뒤 행, 즉시 Blob preview+spinner, 업로드 완료 후 명시 저장,
  실패→새로고침→초안 복구→재시도, A→B→A 업로드 abort/재개와 B 첨부 0개 확인.
- 실제 multiple file input, 다운로드 개수, 전체선택 ZIP/단일 선택 원본과 바이트 동일성 확인.
- 데스크톱·390px 모바일 모달과 레이어 검증, visual 96/pass. privacy/security review APPROVE.
- 기존 README/next-env 변경 보존. Web 신규 env·의존성·Dockerfile 변경 없음.
