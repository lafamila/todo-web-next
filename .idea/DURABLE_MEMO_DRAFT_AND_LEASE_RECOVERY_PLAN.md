# Durable memo drafts and lease recovery

Status: COMPLETED

## Goal

코드블록 포커스 전환 중 편집 lease가 잘못 해제되는 경합을 제거하고, 모든 메모 변경을
브라우저 IndexedDB에 먼저 보존한 뒤 명시적 저장 시 lease/CAS 조건을 만족할 때 서버에
반영한다. 서버 저장이 일시적으로 불가능해도 입력 내용은 기기 초안으로 남고 자동 재시도한다.

## Work items

1. 인라인 라인 활성 상태와 Monaco 포커스를 독립 source로 집계한다.
2. Monaco listener가 최신 callback을 사용하고 unmount 때 정리되도록 한다.
3. user/memo/tab/origin 격리 IndexedDB draft store와 pure save policy를 추가한다.
4. MemoSection에 debounce draft flush, 복구/폐기, CAS 충돌 비교, bounded retry coordinator를 통합한다.
5. 체크박스 즉시 저장과 수동 저장 모두 같은 coordinator를 사용한다.
6. API의 optional revision/baseRevision 계약과 structured conflict payload를 연결한다.
7. normal-flow 복구·저장 상태 UI와 모바일 스타일을 추가하고 문서를 갱신한다.

## Acceptance criteria

- line inactive / Monaco focused 이벤트 순서와 관계없이 combined activity가 false로 내려가지 않는다.
- 입력은 350ms 이내 IndexedDB에 저장되고 수동 저장 직전에 await flush된다. visibility/pagehide flush는
  브라우저 unload 제약 안의 best-effort 보조선이다.
- lease 없음/만료는 pending save를 유지하고 재획득 후 1회 이상 bounded 재시도한다.
- 네트워크/503은 상한 있는 exponential backoff+jitter로 재시도하며 401/403/404는 자동 중단한다.
- 최신 localRevision보다 오래된 저장 성공은 최신 draft를 삭제하지 않는다.
- base revision mismatch 초안은 자동 PUT하지 않고 기존 비교/병합 화면으로 진입한다.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`가 통과한다.

## Verification

- `npm test`: 32 tests passed
- `npx tsc --noEmit`: passed
- `npm run lint`: passed
- `npx next build --webpack`: passed (Next.js 16.1.6; 8 static routes)
