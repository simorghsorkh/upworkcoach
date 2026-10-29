'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Icon } from '@/components/icons/icon';
import { TextField, type TextFieldProps } from '@/components/ui/field';

/** Password input with a show/hide toggle (helps on phones; no paste blocking). */
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'endAdornment'>) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations('auth');
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
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          className="inline-grid size-10 cursor-pointer place-items-center rounded-sm text-fg-3 hover:bg-surface-2 hover:text-fg aria-pressed:text-primary"
        >
          <Icon name="eye" />
        </button>
      }
    />
  );
}
