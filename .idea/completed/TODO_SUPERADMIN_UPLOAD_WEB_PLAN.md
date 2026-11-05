---
status: COMPLETED
completed_at: 2026-11-05
summary: "업로드 UI·paste·Blob 재시도 superadmin 제한"
---

Canonical: `../../../.idea/completed/TODO_SUPERADMIN_UPLOAD_PLAN.md`

## Repo Responsibility / Work Items

permission superadmin만 파일 입력·일반/Raw image paste·retry·자동재개 허용.
권한 회수 abort/Blob 보존, 다운로드·텍스트 편집 유지. 기존 queue/policy 재사용.

## Acceptance Criteria / Report Back

권한 matrix tests, npm test/lint/tsc/build 통과. UI·queue 가드 검토, no new env/dependency.

완료:94/94 tests, lint/tsc/Next production build, 보안 리뷰 APPROVE.
파일 입력 숨김·일반/Raw paste 차단·retry/자동재개 guard·권한 회수 abort/Blob 보존을 적용했다.
기존 읽기/다운로드/로컬 취소/텍스트 편집은 유지하며 신규 env/dependency 없음.
