'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TaskTypeManager from './_components/TaskTypeManager';
import DailyChecklist from './_components/DailyChecklist';

export default function ManagePage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/todo/login?redirect=/calendar/manage');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/40 animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user?.isSuperAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white/80 mb-2">Access Denied</h1>
          <p className="text-white/40">Super admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white/90">Daily Task Manager</h1>
          <button
            onClick={() => router.push('/calendar')}
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            View Calendar &rarr;
          </button>
        </div>

        <div className="space-y-10">
          <DailyChecklist refreshKey={refreshKey} />
          <TaskTypeManager onUpdate={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>
    </div>
  );
}
