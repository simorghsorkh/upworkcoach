import { cn } from './cn';

/**
 * Initial avatar on one of 8 fixed soft colours (design-system §2-7).
 * Colour = hash(id) % 8 so a person has the same colour on every page.
 * Always aria-hidden: the real name is the text next to it.
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizes: Record<AvatarSize, string> = {
  xs: 'size-5 text-2xs',
  sm: 'size-[26px] text-xs',
  md: 'size-8 text-ui',
  lg: 'size-11 text-dlg',
  xl: 'size-16 text-kpi-mob rounded-xl!',
};

const tones = [
  'bg-av-1-bg text-av-1-fg',
  'bg-av-2-bg text-av-2-fg',
  'bg-av-3-bg text-av-3-fg',
  'bg-av-4-bg text-av-4-fg',
  'bg-av-5-bg text-av-5-fg',
  'bg-av-6-bg text-av-6-fg',
  'bg-av-7-bg text-av-7-fg',
  'bg-av-8-bg text-av-8-fg',
] as const;

/** FNV-1a over UTF-16 code units: stable, tiny, good spread for UUIDs. */
export function avatarTone(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 8;
}

/** First visible letter of the name («زهرا کریمی» → «ز» (Zahra Karimi → Z)). */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  const first = Array.from(trimmed)[0];
  return first ?? '؟';
}

export function Avatar({
  id,
  name,
  size = 'md',
  className,
}: {
  id: string;
  name: string;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid flex-none place-items-center rounded-full leading-none font-bold shadow-avatar',
        sizes[size],
        tones[avatarTone(id)],
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}
