'use client';

import { useState } from 'react';
import { useSync } from '@/contexts/SyncContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';

const labels = {
  local: '로컬 전용',
  online: '동기화됨',
  offline: '오프라인',
  paused: '일시정지',
  blocked: '동기화 중단',
  server: '수신 대기',
};

export function SyncStatusIndicator() {
  const { status, displayState, isLoading, error, refresh } = useSync();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const lastOk = status?.lastOkAt ? formatDate(status.lastOkAt) : '기록 없음';
  const isClient = status?.enabled && status.role === 'client';
  const isServer = status?.enabled && status.role === 'server';
  const isLocalOnly = status?.enabled === false;

  return (
    <div className="sync-status">
      <button
        type="button"
        className={`sync-status-summary sync-status-${displayState}`}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="sync-status-dot" aria-hidden />
        <span>{isLoading ? '확인 중' : labels[displayState]}</span>
        {isClient && Boolean(status?.pending) && (
          <span>· 대기 {status?.pending}</span>
        )}
      </button>
      {expanded && (
        <div className="sync-status-detail">
          <strong>{isServer ? '동기화 서버' : labels[displayState]}</strong>
          {isLocalOnly && (
            <span>원격 동기화가 꺼져 있어 이 장치에만 저장합니다.</span>
          )}
          {isServer && (
            <span>클라이언트의 변경을 받을 준비가 되어 있습니다.</span>
          )}
          {isClient && (
            <>
              <span>연결 대상: {status.peerUrl || '설정되지 않음'}</span>
              <span>마지막 성공: {lastOk}</span>
              <span>대기 변경: {status.pending}건</span>
            </>
          )}
          <span>미해결 문제: {status?.issueTotal ?? 0}건</span>
          {!user?.isAdmin && Boolean(status?.issueTotal) && (
            <span>
              문제 상세 확인과 해소는 관리자 권한이 필요합니다.
            </span>
          )}
          {status?.paused && <span>사용자가 동기화를 일시정지했습니다.</span>}
          {(status?.lastError || error) && (
            <span className="sync-status-error">{status?.lastError || error}</span>
          )}
          {displayState === 'offline' && isClient && (
            <span>지금 변경은 이 장치에만 저장되며, 연결 후 전송됩니다.</span>
          )}
          <button type="button" onClick={() => void refresh()}>
            지금 확인
          </button>
        </div>
      )}
    </div>
  );
}
