---
status: COMPLETED
summary: "읽기 상태에서 체크박스 클릭으로 잠금을 얻어 반영하고 재시도 버튼으로 연결·잠금 상태를 실제 재확인한다."
---

# 체크박스 첫 클릭과 편집 잠금 재시도

- 체크박스: 잠금 미확보(readOnly) 상태에서도 현재 메모의 체크 클릭은 잠금 요청으로 이어진다. line id+원문 snapshot을 가진 intent를 보관하고 권한 확보 뒤 딱 한 번 토글/즉시 저장한다.
- 대기 중 메모/버전 변경, 줄 삭제/원문 변경은 stale intent를 적용하지 않는다. 실제 읽기 전용 버전/공개 렌더에는 의도 핸들러를 제공하지 않는다.
- 재시도: 일반 requestLock의 idempotence를 유지하면서 명시적 retryLock이 socket 재연결/방 입장 재확인/낡은 요청·거부 상태 초기화를 수행한다. 서버 권한 확인을 우회하지 않는다.
- API 재입장 권한 거부 시 기존 room/lock/token 정리, room 제거 실패 시 연결 종료. 읽기 권한이 남은 viewer는 구독 유지.
- 중복 지연 lockStatus가 완료된 입장/확보된 자기 잠금을 다시 denied로 만들지 않게 한다. 연결 timeout은 남은 자동 재연결도 취소한다.
- Unicode box-drawing 표는 이번 요청의 '가능 여부 확인' 범위로 코드 경로와 안전한 구현 방식을 검토하여 보고한다. 원문 데이터를 변환하거나 새 표 파서를 배포하지 않는다.

## 검증

- 잠금 없는 초기 메모 체크 첫 클릭: join/lock → grant → 체크 반영/PUT 1회.
- 지연 grant 중 반복 클릭, 다른 문서로 이동, 원문 변경, 읽기 전용 버전에서 잘못된 쓰기 없음.
- transient room failure/lock failure/disconnected socket 후 다시 시도: 실제 요청 재전송/재연결 및 새로고침 없이 ready 복구. 진짜 권한 거부는 편집 불가 유지.
- Web unit tests, lint, typecheck, production build, 샘플 Socket.IO 서버+브라우저 통합 검증.
- 기존 사용자 dirty README.md/next-env.d.ts 유지. API/DB 변경은 필요한 경우만 별도 보고.

## 검증 결과 (2026-09-22)

- 첫 체크 클릭: lockMemo1/PUT1, 라인 편집기0. 지연 grant 중 중복 클릭도 토글/PUT1회.
- 소켓 강제 종료 뒤 다시 시도: reload 없이 재연결/잠금 획득/대기 체크 저장.
- 원문 변경 중 대기: PUT0 및 체크 미변경. 과거 버전 전환 중 grant: PUT0, 보유 lease0, 과거 체크 disabled.
- 읽기 권한 거부 유지: Retry 전/후 join1→2, lock0/PUT0. 권한 복구 후 reload 없이 저장 성공.
- 연결 거부: 5초 뒤 denied로 복귀, pending 영구 고착 없음; transport 취소로 늦은 연결 방지. 다음 재시도는 대기 체크 저장.
- join 응답 억제 뒤 재시도: join3/lock1로 복구.
- joinDelay2100ms로 중복 join 응답 재현: 수정 전 저장 뒤에도 자기 사용자명을 lockHolder로 denied 전환, 수정 후 join2/lock1/PUT1 및 ready 유지.
- Web47 tests/lint/typecheck/webpack production build 통과. API222 tests/48 subtests 통과. 최종 리뷰 APPROVE.
- 샘플 API20125/native Web30335/검증 브라우저 종료. 브라우저 검증은 실제 사용자 DB를 변경하지 않음.
- API 추가 수정: 읽기 권한 회수된 기존 구독/lease 정리 및 정리 실패 시 소켓 연결 종료. 별도 API 실행 계획 참조.
- 상자 문자 표 검토는 BOX_TABLE_RENDERING_FEASIBILITY.md 참조(구현 미포함).
