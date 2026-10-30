'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Icon } from '@/components/icons/icon';
import { cn } from './cn';

/**
 * Dialog on desktop, bottom sheet on mobile (< 768px) — design-system §3-3
 * "Form/window" and mockups §18 (.sheet). Built on native <dialog>.showModal():
 * the rest of the page becomes inert (focus is trapped), Esc closes, and focus
 * returns to the opener. No dependency, no portal.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Action row (buttons). Sticks to the bottom of the sheet on mobile. */
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The native `close` event also fires when `open` turns false (e.g. a menu that hands over
  // to another dialog); only a close the user started may call `onClose`.
  const openRef = useRef(open);
  openRef.current = open;
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      const root = document.documentElement;
      const previous = root.style.overflow;
      root.style.overflow = 'hidden';
      return () => {
        root.style.overflow = previous;
      };
    }
    if (!open && dialog.open) dialog.close();
    return undefined;
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Esc (native cancel) and the close button cover keyboards
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // React re-dispatches `close`/`cancel` of a nested <dialog> (e.g. the password check
      // inside "New mentor") to its ancestors: only react to this element's own events.
      onClose={(event) => {
        if (event.target === event.currentTarget && openRef.current) onClose();
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        'border border-line bg-surface text-fg shadow-lg open:animate-rise',
        // desktop: centred window
        'md:m-auto md:max-h-[90vh] md:w-full md:max-w-dialog md:rounded-xl md:p-6',
        // mobile: bottom sheet
        'max-md:mx-0 max-md:mt-auto max-md:mb-0 max-md:max-h-[92vh] max-md:w-full max-md:max-w-none max-md:rounded-t-xl max-md:border-0 max-md:px-4 max-md:pt-3 max-md:pb-[calc(16px+env(safe-area-inset-bottom))]',
        'overflow-y-auto',
        className,
      )}
    >
      {open ? (
        <>
          <div
            aria-hidden="true"
            className="mx-auto mb-3 h-1 w-10 rounded-[2px] bg-line-2 md:hidden"
          />
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-dlg">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-0.5 text-sm text-fg-3">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="-me-2 -mt-1 inline-grid size-tap flex-none cursor-pointer place-items-center rounded-sm text-fg-2 hover:bg-surface-2 hover:text-fg md:size-9"
            >
              <Icon name="x" />
            </button>
          </div>
          {children}
          {footer ? (
            <div className="sticky -bottom-4 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface pt-4 max-md:-mb-4 max-md:pb-4 max-md:[&>*]:flex-1 md:static">
              {footer}
            </div>
          ) : null}
        </>
      ) : null}
    </dialog>
  );
}

/**
 * Action row inside a dialog body (same look as the `footer` prop): use it when the buttons
 * belong to a <form> rendered as the dialog's children. Sticks to the bottom of the sheet on
 * mobile, buttons share the width.
 */
export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky -bottom-4 z-10 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface pt-4 max-md:-mb-4 max-md:pb-4 max-md:[&>*]:flex-1 md:static">
      {children}
    </div>
  );
}
