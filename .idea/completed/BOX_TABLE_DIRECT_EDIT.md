---
status: COMPLETED
summary: "중복된 표 원문 편집 버튼 제거, 셀 클릭 편집 유지"
---

# 표 직접 편집 진입

- 비활성 표 위의 '표 원문 편집' 버튼만 제거한다. 기존 셀 클릭·lease 획득·원문 위치 복원은 그대로 둔다.
- 원문 편집 중 '표로 보기', Escape, 읽기 전용 버전 동작은 유지한다.
- 도움말/CLAUDE.md 설명에서 제거한 버튼을 안내하지 않는다.
- 통과 기준: tests/lint/typecheck/build, 브라우저에서 버튼 부재·셀 클릭 편집·Escape 복귀·모바일 표 표시 확인.
- API/DB/env/deploy 변경 없음. 기존 README/next-env 변경 보존.

## 검증 (2026-09-23)

- 57 tests, lint, TypeScript, production build, diff-check 통과.
- 격리된 native QA API/웹에서 버튼 0개·표 1개 확인. 셀 클릭으로 lease 확보 후 원문 column 8에 textarea 포커스, Escape 후 표 복귀 확인.
- 모바일 390px에서 page scrollWidth 390, 표 1개·편집 버튼 0개 확인. 시각 검증 pass 98.
- 테스트 프로세스/브라우저 종료. 기존 사용자 README/next-env 수정은 커밋 제외. 푸시·Docker 재빌드 없음.
