import { Checkbox } from '@/components/ui/Checkbox';

export interface CheckboxItemProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  content: string;
}

export function CheckboxItem({ checked, onChange, content }: CheckboxItemProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox checked={checked} onChange={onChange} />
      <span className={`flex-1 ${checked ? 'line-through' : ''}`}>
        {content}
      </span>
    </div>
  );
}
