'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyTodoLoginPage() {
  const router = useRouter();

  useEffect(() => {
    const query = window.location.search.slice(1);
    router.replace(query ? `/login?${query}` : '/login');
  }, [router]);

  return null;
}
