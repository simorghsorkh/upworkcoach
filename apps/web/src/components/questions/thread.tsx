import { AttachmentThumbs } from '@/components/files/image-uploads';
import { faDayTime } from '@/components/format/fa';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/components/ui/cn';
import { ExternalLink } from '@/components/ui/ltr';
import type { AttachmentDTO } from '@/modules/files/contracts';

export type ThreadMessage = {
  id: string;
  authorKey: string;
  authorName: string;
  /** Team message (mentor / admin) or the student's. */
  team: boolean;
  /** Drawn on the reader's own side. */
  mine: boolean;
  body: string;
  links: Array<{ url: string; label: string | null }>;
  attachments: AttachmentDTO[];
  createdAt: string;
};

/**
 * A question thread (F8: asynchronous, not a chat). The reader's own messages sit at the end
 * of the line in indigo; the other side's at the start. Text is `dir="auto"` so an English
 * sentence copied from Upwork reads left to right inside the Persian page.
 */
export function Thread({ messages, now }: { messages: ThreadMessage[]; now: Date }) {
  return (
    <ol aria-label="پیام‌ها" className="flex flex-col gap-4">
      {messages.map((m) => (
        <li
          key={m.id}
          className={cn('flex max-w-full items-start gap-2.5', m.mine && 'flex-row-reverse')}
        >
          <Avatar id={m.authorKey} name={m.authorName} size="sm" className="mt-1 flex-none" />
          <div
            className={cn(
              'min-w-0 max-w-[min(100%,560px)] rounded-lg border px-4 py-3',
              m.mine
                ? 'border-primary-line bg-primary-weak'
                : m.team
                  ? 'border-line bg-surface'
                  : 'border-line bg-bg',
            )}
          >
            <p className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
              <strong className="font-semibold text-fg">{m.authorName}</strong>
              {m.team ? <span>تیم</span> : null}
              <span>{faDayTime(new Date(m.createdAt), now)}</span>
            </p>
            <p
              dir="auto"
              className="text-ui leading-6 whitespace-pre-line text-fg [overflow-wrap:anywhere]"
            >
              {m.body}
            </p>
            {m.links.length ? (
              <ul className="mt-2 flex flex-col gap-1">
                {m.links.map((l) => (
                  <li key={l.url} className="flex min-w-0 flex-wrap items-center gap-2">
                    {l.label ? (
                      <span dir="auto" className="text-sm text-fg-2">
                        {l.label}:
                      </span>
                    ) : null}
                    <ExternalLink href={l.url} />
                  </li>
                ))}
              </ul>
            ) : null}
            <AttachmentThumbs items={m.attachments} />
          </div>
        </li>
      ))}
    </ol>
  );
}
