'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icons/icon';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { PlatformDTO } from '@/modules/catalog/contracts';
import type { MentorOptionDTO } from '@/modules/identity/contracts';
import {
  InviteReady,
  NewStudentForm,
  type NewStudentResult,
  type StageOption,
} from './new-student-form';

/**
 * "New student" button + dialog (bottom sheet on mobile). Opens by itself when the page is
 * reached with `?new=1` (the mobile quick-add sheet links to /students/new).
 */
export function NewStudentDialog({
  viewer,
  mentors,
  stages,
  platforms,
  initiallyOpen = false,
  buttonClassName,
  iconOnly,
}: {
  viewer: { id: string; role: 'admin' | 'mentor' };
  mentors: MentorOptionDTO[];
  stages: StageOption[];
  platforms: PlatformDTO[];
  initiallyOpen?: boolean;
  buttonClassName?: string;
  /** Mobile top-bar style: «+» only, with an accessible name. */
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(initiallyOpen);
  const [created, setCreated] = useState<NewStudentResult | null>(null);

  function close() {
    setOpen(false);
    if (created) router.refresh();
    setCreated(null);
    if (searchParams.has('new')) {
      const params = new URLSearchParams(searchParams);
      params.delete('new');
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }

  const firstName = created?.student.displayName.trim().split(/\s+/)[0];

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          aria-label="هنرجوی جدید"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className={buttonClassName}
        >
          <Icon name="plus" />
        </button>
      ) : (
        <Button
          variant="primary"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className={buttonClassName}
        >
          <Icon name="plus" size={16} />
          هنرجوی جدید
        </Button>
      )}
      <Dialog
        open={open}
        onClose={close}
        title={created ? `پرونده‌ی ${firstName} ساخته شد` : 'هنرجوی جدید'}
        description={created ? undefined : 'فقط نام و موبایل لازم است؛ کمتر از یک دقیقه'}
      >
        {created ? (
          <InviteReady result={created} onDone={() => setOpen(false)} />
        ) : (
          <NewStudentForm
            viewer={viewer}
            mentors={mentors}
            stages={stages}
            platforms={platforms}
            onCreated={(result) => setCreated(result)}
            onCancel={close}
          />
        )}
      </Dialog>
    </>
  );
}
