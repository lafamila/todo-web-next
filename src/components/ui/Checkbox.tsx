import { cn } from '@/lib/utils';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: CheckboxProps) {
  const handleCheckboxChange = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <label
      className={cn(
        'flex items-center gap-2 cursor-pointer',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div
        className={cn(
          'w-3 h-3 border-1 rounded-[2px] flex items-center justify-center transition-colors',
          checked
            ? 'bg-gray-900 border-gray-900'
            : 'bg-white border-gray-300 hover:border-gray-400'
        )}
        onClick={handleCheckboxChange}
      >
        {checked && (
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
      {label && <span className="text-gray-700" onClick={handleCheckboxChange}>{label}</span>}
    </label>
  );
}
