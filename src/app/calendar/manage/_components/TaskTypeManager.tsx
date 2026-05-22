'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import type { DailyTaskTypeInterface } from '@/lib/types';

interface TaskTypeManagerProps {
  onUpdate: () => void;
}

export default function TaskTypeManager({ onUpdate }: TaskTypeManagerProps) {
  const [types, setTypes] = useState<DailyTaskTypeInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('#3994ef');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fetchTypes = useCallback(async () => {
    try {
      const data = await api.getTaskTypes();
      setTypes(data);
    } catch {
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      await api.createTaskType({ name: name.trim(), icon, color });
      setName('');
      setIcon('');
      setColor('#3994ef');
      await fetchTypes();
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (t: DailyTaskTypeInterface) => {
    try {
      if (t.isActive) {
        await api.deleteTaskType(t.id);
      } else {
        await api.updateTaskType(t.id, { isActive: true });
      }
      await fetchTypes();
      onUpdate();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const activeCount = types.filter((t) => t.isActive).length;
  const limitReached = activeCount >= 50;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white/80 mb-4">Task Types</h2>

      {/* Create form */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="Icon"
          maxLength={2}
          className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-center text-white/70 focus:outline-none focus:border-white/30"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Task name"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-white/30"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
        />
        <button
          type="submit"
          disabled={creating || !name.trim() || limitReached}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-sm text-white/70 transition-colors disabled:opacity-30"
        >
          Add
        </button>
      </form>

      {error && <p className="text-red-400/80 text-sm mb-3">{error}</p>}
      {limitReached && <p className="text-amber-400/60 text-sm mb-3">Maximum 50 task types reached.</p>}

      {/* Task type list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : types.length === 0 ? (
        <p className="text-white/30 text-sm py-4">No task types yet. Create one above.</p>
      ) : (
        <div className="space-y-1.5">
          {types.map((t) => (
            <div
              key={t.id}
              className={`
                flex items-center justify-between px-4 py-2.5 rounded-lg border transition-all
                ${t.isActive
                  ? 'bg-white/[0.03] border-white/[0.06]'
                  : 'bg-white/[0.01] border-white/[0.03] opacity-50'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                <span className="text-sm text-white/70">
                  {t.icon && <span className="mr-1.5">{t.icon}</span>}
                  {t.name}
                </span>
              </div>
              <button
                onClick={() => handleToggleActive(t)}
                className={`
                  text-xs px-3 py-1 rounded-md transition-colors
                  ${t.isActive
                    ? 'text-white/40 hover:text-red-400/70 hover:bg-red-900/20'
                    : 'text-white/40 hover:text-green-400/70 hover:bg-green-900/20'
                  }
                `}
              >
                {t.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
