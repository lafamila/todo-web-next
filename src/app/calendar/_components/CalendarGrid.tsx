'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MonthNavigator from './MonthNavigator';
import DayCell, { type ThemeName } from './DayCell';
import type { CalendarDayInterface, CalendarMonthInterface } from '@/lib/types';
import { getCalendarMonth } from '@/lib/api';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const THEME_NAMES: ThemeName[] = ['warm', 'nature', 'cool', 'github'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarGrid() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<CalendarMonthInterface | null>(null);
  const [direction, setDirection] = useState(0);

  const theme = THEME_NAMES[(year + month) % THEME_NAMES.length];

  useEffect(() => {
    let cancelled = false;
    getCalendarMonth(year, month)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
    return () => { cancelled = true; };
  }, [year, month]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayStr = formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDayInterface>();
    data?.days.forEach((d) => map.set(d.date, d));
    return map;
  }, [data]);

  const handlePrev = () => {
    setDirection(-1);
    setData(null);
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };

  const handleNext = () => {
    setDirection(1);
    setData(null);
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  // Build grid cells: leading blanks + actual days
  const cells: { dayNumber: number; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ dayNumber: 0, isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dayNumber: d, isCurrentMonth: true });
  }
  // Trailing blanks to fill last row
  while (cells.length % 7 !== 0) {
    cells.push({ dayNumber: 0, isCurrentMonth: false });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
      <MonthNavigator year={year} month={month} onPrev={handlePrev} onNext={handleNext} />

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] sm:text-xs text-white/25 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${year}-${month}`}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="grid grid-cols-7 gap-1.5 sm:gap-2"
        >
          {data === null
            ? cells.map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-white/[0.02] border border-white/[0.04] animate-pulse" />
              ))
            : cells.map((cell, i) => {
                const dateStr = cell.isCurrentMonth ? formatDate(year, month, cell.dayNumber) : '';
                return (
                  <DayCell
                    key={i}
                    day={cell.isCurrentMonth ? (dayMap.get(dateStr) ?? null) : null}
                    dayNumber={cell.dayNumber}
                    isCurrentMonth={cell.isCurrentMonth}
                    isToday={dateStr === todayStr}
                    theme={theme}
                  />
                );
              })
          }
        </motion.div>
      </AnimatePresence>

      {/* Legend */}
      {data && data.totalTaskTypes > 0 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] sm:text-xs text-white/25">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`w-3 h-3 sm:w-4 sm:h-4 rounded-sm border ${
                theme === 'github'
                  ? ['bg-[#161b22] border-[#21262d]', 'bg-[#0e4429] border-[#1a5a3a]', 'bg-[#006d32] border-[#00803b]', 'bg-[#26a641] border-[#2fbf4e]', 'bg-[#39d353] border-[#4ae068]'][step]
                  : theme === 'warm'
                  ? ['bg-white/[0.02] border-white/[0.04]', 'bg-amber-900/30 border-amber-700/20', 'bg-orange-700/40 border-orange-500/25', 'bg-amber-500/50 border-amber-400/30', 'bg-yellow-400/60 border-yellow-300/40'][step]
                  : theme === 'nature'
                  ? ['bg-white/[0.02] border-white/[0.04]', 'bg-green-900/30 border-green-700/20', 'bg-emerald-700/40 border-emerald-500/25', 'bg-emerald-500/50 border-emerald-400/30', 'bg-green-400/60 border-green-300/40'][step]
                  : ['bg-white/[0.02] border-white/[0.04]', 'bg-indigo-900/30 border-indigo-700/20', 'bg-blue-700/40 border-blue-500/25', 'bg-purple-500/50 border-purple-400/30', 'bg-violet-400/60 border-violet-300/40'][step]
              }`}
            />
          ))}
          <span>More</span>
        </div>
      )}
    </div>
  );
}
