---
status: COMPLETED
completed_at: 2026-11-05
summary: "메모 파일 drop·커서 다음 줄 이미지·이미지 제외 다운로드·게시 숨김"
---

Canonical: `../../../.idea/completed/TODO_MEMO_DROP_UPLOAD_PLAN.md`

## Repo Responsibility / Work Items

기존 업로드 큐/메모 상태 모델을 재사용해 본문 drop을 추가한다. superadmin/lease/readonly 가드 유지.
drop 이미지와 paste 이미지는 배치 의미가 다르다: drop은 현재 문장을 보존한 다음 줄, paste는 기존 동작.
InlineEditor와 Raw의 code/table block 경계 보존, undo와 마지막 커서 기억. 다운로드 isImage 제외와 게시 UI 숨김.
추가 요청: 이미지 너비를 메모 칸 대비10~100%로 조절·aspect-ratio 유지, token width suffix 본문 저장.
기존 자동 크기·read-only renderer·undo/draft·실패 업로드 취소도 함께 유지한다.
추가 요청: 백로그 저장과 닫기를 분리한다. Cmd/Ctrl+S/모바일 저장은 열린 상태 유지,
기존 토글/CmdShiftS·Esc 두번·모바일 닫기 동작만 닫는다.

## Acceptance Criteria / Report Back

root 검증 기준 + 기존 텍스트 drop 유지·이미지만/혼합 파일 개수·readonly 권한 matrix.
테스트/lint/tsc/build/native browser/visual 및 보안·데이터 유실 리뷰, 문서 업데이트 후 feature commit/push.

## 완료 검증

- 105/105 tests, lint/tsc/Next production build, diff check, bounded review APPROVE.
- real router/lease+MySQL scratch와 in-memory attachment fixture의 native browser 검증(root plan 증거 참조).
- mixed drop/preview/picker/Raw/code/권한/다운로드 이미지 제외, width60 저장·버전·Undo/portrait ratio 및 mobile 검증.
- 백로그 CmdS·mobile 저장 후 유지, CmdShiftS·Esc×2 닫기 검증. 저장 후 닫기 연결·전용 정책 삭제.
- CLAUDE 갱신, README/next-env 사용자 변경 보존. API·새env·의존성·Docker 변경 없음.
