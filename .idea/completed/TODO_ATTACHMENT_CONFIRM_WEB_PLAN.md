---
status: COMPLETED
completed_at: 2026-11-06
summary: "첨부파일 삭제 confirm과 빈 다운로드 모달 닫기"
---

Canonical: `../../../.idea/completed/TODO_ATTACHMENT_CONFIRM_PLAN.md`

## 구현 / 검토 기준

MemoAttachments의 deleteConfirming 상태를 제거하고 confirm 승인 후 기존 onDelete를 호출한다.
공유 Button danger variant를 재사용하고, 다운로드 대상이 비면 기존 모달 상태를 닫는다.
업로더·history·busy·scope 보호는 보존한다. 기존 선택/이미지 제외 정책은 변경하지 않는다.
tests/lint/tsc/build, 실제 native browser 취소/부분·전체 삭제/실패/PC·mobile visual 검증 후 완료한다.
새 env/API/dependency/Docker 변경 없음. 사용자 README/next-env 변경 보존.

완료:107tests/lint/tsc/native build/diff 통과. 실제 native confirm 취소 요청0건·확인 부분삭제1회·
실패 시 모달/선택 보존·이미지1개를 남긴 마지막 일반 파일 삭제 후 버튼+모달 닫기 검증.
PC/mobile visual98,390px overflow0. 공유 danger 버튼 재사용, 확인 상태/경고 분기 삭제.
CLAUDE 반영, root 계약/환경 영향 없음, 앱 Docker 재빌드 불필요·미실행.
테스트 인프라 cleanup의 Docker read-only 문제는 root plan에 기록했다.
