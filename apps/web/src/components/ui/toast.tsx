'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';

/**
 * Toast — design-system §4 `.toast`: ink background, green check, optional
 * "Undo" with a seconds countdown; role="status" (polite).
 */
type ToastInput = {
  message: string;
  /** Optional undo action; shows "Undo" and a countdown. */
  onUndo?: () => void;
  undoLabel?: string;
  /** Seconds before the toast disappears (default 5; 10 when undo is offered). */
  seconds?: number;
};

type ToastItem = ToastInput & { id: number; seconds: number };

type ToastApi = { show: (toast: ToastInput) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    const seconds = toast.seconds ?? (toast.onUndo ? 10 : 5);
    // One at a time keeps the screen calm and the live region readable.
    setItems([{ ...toast, id, seconds }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+16px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
      >
        {items.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [left, setLeft] = useState(toast.seconds);
  const { id } = toast;

  useEffect(() => {
    if (left <= 0) {
      onDismiss(id);
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, id, onDismiss]);

  return (
    <div className="pointer-events-auto inline-flex max-w-[440px] animate-rise items-center gap-4 rounded-md bg-toast-bg px-4 py-3 text-ui text-toast-fg shadow-lg">
      <Icon name="check-circle" className="text-toast-icon" />
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.onUndo ? (
        <>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 font-bold text-toast-link hover:underline"
            onClick={() => {
              toast.onUndo?.();
              onDismiss(id);
            }}
          >
            <Icon name="undo" size={16} />
            {toast.undoLabel ?? 'برگرداندن'}
          </button>
          <span className="text-xs text-toast-meta tabular-nums" aria-hidden="true">
            {faNumber(left)} ثانیه
          </span>
        </>
      ) : null}
    </div>
  );
}
