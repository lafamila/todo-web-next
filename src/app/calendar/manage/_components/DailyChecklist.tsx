'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import type { DayDetailTaskInterface } from '@/lib/types';

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DailyChecklistProps {
  refreshKey: number;
}

export default function DailyChecklist({ refreshKey }: DailyChecklistProps) {
  const [date, setDate] = useState(formatDate(new Date()));
  const [tasks, setTasks] = useState<DayDetailTaskInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchDay = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await api.getDayDetail(date);
      setTasks(detail.tasks);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchDay(); }, [fetchDay, refreshKey]);

  const handleToggle = async (task: DayDetailTaskInterface) => {
    setToggling(task.taskTypeId);
    try {
      if (task.completed) {
        await api.uncompleteTask(task.taskTypeId, date);
      } else {
        await api.completeTask(task.taskTypeId, date);
      }
      await fetchDay();
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally {
      setToggling(null);
    }
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white/80">Daily Checklist</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/70 focus:outline-none focus:border-white/30"
        />
      </div>

      {tasks.length > 0 && (
        <div className="mb-3 text-sm text-white/40">
          {completedCount}/{tasks.length} completed
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-white/30 text-sm py-4">No task types registered yet.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <button
              key={task.taskTypeId}
              onClick={() => handleToggle(task)}
              disabled={toggling === task.taskTypeId}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left
                ${task.completed
                  ? 'bg-white/[0.06] border-white/10'
                  : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]'
                }
                ${toggling === task.taskTypeId ? 'opacity-50' : ''}
              `}
            >
              <div className={`
                w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
                ${task.completed
                  ? 'bg-green-500/80 border-green-400/60'
                  : 'border-white/20'
                }
              `}>
                {task.completed && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-sm ${task.completed ? 'text-white/60 line-through' : 'text-white/80'}`}>
                {task.icon && <span className="mr-1.5">{task.icon}</span>}
                {task.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
