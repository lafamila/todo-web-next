'use client';

import { motion } from 'framer-motion';
import type { CalendarDayInterface } from '@/lib/types';

// 4 color themes
const THEMES = {
  warm: {
    name: 'warm',
    steps: [
      'bg-white/[0.02] border-white/[0.04]',                    // 0%
      'bg-amber-900/30 border-amber-700/20 shadow-amber-900/20', // 1-33%
      'bg-orange-700/40 border-orange-500/25 shadow-orange-700/30', // 34-66%
      'bg-amber-500/50 border-amber-400/30 shadow-amber-500/40',   // 67-99%
      'bg-gradient-to-br from-yellow-400/60 to-amber-500/60 border-yellow-300/40 shadow-yellow-400/50', // 100%
    ],
    glow100: 'shadow-[0_0_20px_rgba(251,191,36,0.4)]',
    badge: ['text-white/20', 'text-amber-300/60', 'text-orange-300/70', 'text-amber-200/80', 'text-yellow-200/90'],
  },
  nature: {
    name: 'nature',
    steps: [
      'bg-white/[0.02] border-white/[0.04]',
      'bg-green-900/30 border-green-700/20 shadow-green-900/20',
      'bg-emerald-700/40 border-emerald-500/25 shadow-emerald-700/30',
      'bg-emerald-500/50 border-emerald-400/30 shadow-emerald-500/40',
      'bg-gradient-to-br from-green-400/60 to-emerald-500/60 border-green-300/40 shadow-green-400/50',
    ],
    glow100: 'shadow-[0_0_20px_rgba(52,211,153,0.4)]',
    badge: ['text-white/20', 'text-green-300/60', 'text-emerald-300/70', 'text-emerald-200/80', 'text-green-200/90'],
  },
  cool: {
    name: 'cool',
    steps: [
      'bg-white/[0.02] border-white/[0.04]',
      'bg-indigo-900/30 border-indigo-700/20 shadow-indigo-900/20',
      'bg-blue-700/40 border-blue-500/25 shadow-blue-700/30',
      'bg-purple-500/50 border-purple-400/30 shadow-purple-500/40',
      'bg-gradient-to-br from-violet-400/60 to-purple-500/60 border-violet-300/40 shadow-violet-400/50',
    ],
    glow100: 'shadow-[0_0_20px_rgba(167,139,250,0.4)]',
    badge: ['text-white/20', 'text-indigo-300/60', 'text-blue-300/70', 'text-purple-200/80', 'text-violet-200/90'],
  },
  github: {
    name: 'github',
    steps: [
      'bg-[#161b22] border-[#21262d]',
      'bg-[#0e4429] border-[#1a5a3a]',
      'bg-[#006d32] border-[#00803b]',
      'bg-[#26a641] border-[#2fbf4e]',
      'bg-[#39d353] border-[#4ae068]',
    ],
    glow100: 'shadow-[0_0_20px_rgba(57,211,83,0.3)]',
    badge: ['text-white/20', 'text-green-400/60', 'text-green-300/70', 'text-green-200/80', 'text-green-100/90'],
  },
} as const;

export type ThemeName = keyof typeof THEMES;

function getStepIndex(ratio: number): number {
  if (ratio <= 0) return 0;
  if (ratio < 0.34) return 1;
  if (ratio < 0.67) return 2;
  if (ratio < 1) return 3;
  return 4;
}

interface DayCellProps {
  day: CalendarDayInterface | null;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  theme: ThemeName;
}

export default function DayCell({ day, dayNumber, isCurrentMonth, isToday, theme }: DayCellProps) {
  const t = THEMES[theme];
  const ratio = day?.ratio ?? 0;
  const stepIndex = getStepIndex(ratio);
  const isPerfect = ratio === 1 && (day?.totalCount ?? 0) > 0;

  if (!isCurrentMonth) {
    return <div className="aspect-square rounded-lg opacity-0" />;
  }

  return (
    <motion.div
      whileHover={{ scale: 1.08, zIndex: 10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`
        aspect-square rounded-lg border relative cursor-default
        transition-all duration-300
        ${t.steps[stepIndex]}
        ${isPerfect ? t.glow100 : ''}
        ${isToday ? 'ring-1 ring-white/30' : ''}
      `}
    >
      {isPerfect && (
        <motion.div
          className="absolute inset-0 rounded-lg"
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%)',
          }}
        />
      )}

      <div className="absolute top-1 left-1.5 sm:top-1.5 sm:left-2">
        <span className={`text-[10px] sm:text-xs font-medium ${
          isToday ? 'text-white/90' : 'text-white/40'
        }`}>
          {dayNumber}
        </span>
      </div>

      {day && day.totalCount > 0 && (
        <div className="absolute bottom-1 right-1.5 sm:bottom-1.5 sm:right-2">
          <span className={`text-[9px] sm:text-[11px] font-mono ${t.badge[stepIndex]}`}>
            {day.completedCount}/{day.totalCount}
          </span>
        </div>
      )}
    </motion.div>
  );
}

export { THEMES };
