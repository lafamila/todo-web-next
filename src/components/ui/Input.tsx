import React from 'react';

export interface InputProps {
  type?: 'text' | 'password';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  name?: string;
  ref?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onKeyUp?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  autoFocus = false,
  autoComplete,
  name,
  ref,
  onKeyDown,
  onKeyUp,
}: InputProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={handleInputChange}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      name={name}
      className={className}
    />
  );
}
