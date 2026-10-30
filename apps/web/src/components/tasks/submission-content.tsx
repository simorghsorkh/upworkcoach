import { faNumber } from '@/components/format/fa';
import { ExternalLink, LtrBlock } from '@/components/ui/ltr';
import { PlatformBadge } from '@/components/ui/platform';
import type { AttachmentDTO } from '@/modules/files/contracts';

type Content = {
  bodyText: string | null;
  links: Array<{ url: string; label: string | null }>;
  platform: { id: string; name: string } | null;
  jobPostText: string | null;
  proposalText: string | null;
  profileText: string | null;
  attachments: AttachmentDTO[];
};

function LtrLabel({ children, count }: { children: string; count?: number }) {
  return (
    <p className="mt-4 mb-1.5 flex items-center gap-2 text-xs font-semibold text-fg-3">
      {children}
      <span
        dir="ltr"
        className="rounded-[4px] bg-surface-3 px-1.5 py-px text-[10px] font-extrabold tracking-wide text-fg-2"
      >
        EN
      </span>
      {count !== undefined ? (
        <span dir="ltr" className="ms-auto text-xs font-normal text-fg-3 [unicode-bidi:isolate]">
          {`${count} chars`}
        </span>
      ) : null}
    </p>
  );
}

/**
 * One submission version (M6 "Amir's submission", S3 history): Persian text, the English Upwork
 * content in its own LTR blocks (design-system §7), links with their destination visible
 * (SEC-X6) and image attachments served by our API.
 */
export function SubmissionContent({ submission: s }: { submission: Content }) {
  return (
    <div className="min-w-0">
      {s.platform ? (
        <p className="mb-2 flex items-center gap-2 text-sm text-fg-2">
          پلتفرم: <PlatformBadge name={s.platform.name} />
        </p>
      ) : null}
      {s.bodyText ? (
        <p dir="auto" className="text-ui leading-6 whitespace-pre-line [overflow-wrap:anywhere]">
          {s.bodyText}
        </p>
      ) : null}
      {s.jobPostText ? (
        <>
          <LtrLabel>متن آگهی</LtrLabel>
          <LtrBlock>{s.jobPostText}</LtrBlock>
        </>
      ) : null}
      {s.proposalText ? (
        <>
          <LtrLabel count={s.proposalText.length}>متن پروپوزال</LtrLabel>
          <LtrBlock>{s.proposalText}</LtrBlock>
        </>
      ) : null}
      {s.profileText ? (
        <>
          <LtrLabel count={s.profileText.length}>متن ویترین</LtrLabel>
          <LtrBlock>{s.profileText}</LtrBlock>
        </>
      ) : null}
      {s.links.length ? (
        <>
          <p className="mt-4 mb-1.5 text-xs font-semibold text-fg-3">لینک‌ها</p>
          <ul className="flex flex-col gap-1">
            {s.links.map((l) => (
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
        </>
      ) : null}
      {s.attachments.length ? (
        <>
          <p className="mt-4 mb-1.5 text-xs font-semibold text-fg-3">
            {`تصویرها (${faNumber(s.attachments.length)})`}
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {s.attachments.map((a) => (
              <li key={a.id} className="min-w-0">
                <a
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-sm border border-line bg-bg hover:border-primary-line"
                >
                  {/* biome-ignore lint/performance/noImgElement: same-origin protected file; next/image would proxy it */}
                  <img
                    src={a.href}
                    alt={a.originalName}
                    width={a.width}
                    height={a.height}
                    loading="lazy"
                    className="aspect-[4/3] h-auto w-full object-cover"
                  />
                  <span dir="auto" className="block truncate px-2 py-1 text-xs text-fg-2">
                    {a.originalName}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!s.bodyText &&
      !s.jobPostText &&
      !s.proposalText &&
      !s.profileText &&
      !s.links.length &&
      !s.attachments.length ? (
        <p className="text-sm text-fg-3">«انجام دادم» زده شد؛ محتوایی ندارد.</p>
      ) : null}
    </div>
  );
}
