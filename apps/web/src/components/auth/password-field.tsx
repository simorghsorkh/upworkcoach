'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons/icon';
import { TextField, type TextFieldProps } from '@/components/ui/field';

/** Password input with a show/hide toggle (helps on phones; no paste blocking). */
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'endAdornment'>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      endAdornment={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'پنهان کردن رمز' : 'نمایش رمز'}
          className="inline-grid size-10 cursor-pointer place-items-center rounded-sm text-fg-3 hover:bg-surface-2 hover:text-fg aria-pressed:text-primary"
        >
          <Icon name="eye" />
        </button>
      }
    />
  );
}
