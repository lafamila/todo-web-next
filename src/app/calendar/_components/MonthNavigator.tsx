'use client';

import { motion, AnimatePresence } from 'framer-motion';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MonthNavigatorProps {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function MonthNavigator({ year, month, onPrev, onNext }: MonthNavigatorProps) {
  return (
    <div className="flex items-center justify-center gap-6 mb-8">
      <button
        onClick={onPrev}
        className="text-white/40 hover:text-white/80 transition-colors text-2xl px-3 py-1 rounded-lg hover:bg-white/5"
      >
        &larr;
      </button>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${year}-${month}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="text-center min-w-[200px]"
        >
          <h1 className="text-3xl font-bold text-white/90 tracking-tight">
            {MONTH_NAMES[month - 1]}
          </h1>
          <p className="text-white/30 text-sm mt-1">{year}</p>
        </motion.div>
      </AnimatePresence>
      <button
        onClick={onNext}
        className="text-white/40 hover:text-white/80 transition-colors text-2xl px-3 py-1 rounded-lg hover:bg-white/5"
      >
        &rarr;
      </button>
    </div>
  );
}
