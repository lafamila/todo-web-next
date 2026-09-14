---
status: COMPLETED
title: Project-scoped ranked memo search
---

# 프로젝트 최신 메모 검색

## 목표

프로젝트 제목 행에서 현재 프로젝트의 저장된 최신 메모를 관련도 순으로 검색하고, 결과를 선택하면 기존 메모 선택 흐름으로 이동한다.

## 구현

- `GET /api/projects/{projectId}/memos/search?q&limit=20` 클라이언트 계약과 segment 타입을 추가했다.
- 서버가 만든 제목·문맥 segment를 React text/`mark`로 렌더해 HTML 삽입 없이 강조한다.
- 220ms debounce, AbortController, request sequence, 프로젝트 변경 초기화로 느린 이전 응답을 차단한다.
- IME 조합 중 요청과 Enter 이동을 막고 조합 종료 후 검색한다.
- ArrowUp/ArrowDown, Enter, Escape, 바깥 클릭과 combobox/listbox 접근성 속성을 제공한다.
- Cmd/Ctrl+Shift+P는 검색창, Cmd/Ctrl+Shift+O는 관리자 멤버 관리로 연결한다.
- 모바일 결과는 헤더 아래 viewport 폭을 사용하고 선택 시 기존 detail 화면으로 전환한다.

## 검증

- `npm test`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build -- --webpack`
