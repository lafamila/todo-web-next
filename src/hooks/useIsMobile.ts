'use client';

import { useEffect, useState } from 'react';

/**
 * 모바일 레이아웃 분기점. CSS 의 `@media (max-width: 768px)` 와 **같은 값**이어야 한다 —
 * 레이아웃(CSS)과 동작(JS: 뷰 전환·툴바 위치)이 같은 경계에서 바뀌어야 하기 때문이다.
 * 값을 바꿀 때는 todo/global.css 의 미디어 쿼리도 함께 고친다.
 */
export const MOBILE_BREAKPOINT_PX = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

/** 현재 뷰포트가 모바일 폭인지. SSR/최초 렌더에서는 false(데스크톱)로 시작한다. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const apply = () => setIsMobile(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  return isMobile;
}
