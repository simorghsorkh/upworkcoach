import type { IconName } from '@/components/icons/icon';
import type { CountTone } from '@/components/ui/badge';
import type { Messages } from '@/i18n/messages';

/** Key of a navigation label in the `nav` namespace of the message catalog (ADR-0013). */
export type NavLabel = keyof Messages['nav'];

/** Navigation of docs/03-ux/sitemap.md §3 (staff) and §4 (student). */
export type NavItem = { href: string; label: NavLabel; icon: IconName };

export const staffNav: readonly NavItem[] = [
  { href: '/today', label: 'today', icon: 'today' },
  { href: '/students', label: 'students', icon: 'users' },
  { href: '/stages', label: 'stages', icon: 'board' },
  { href: '/tasks', label: 'tasks', icon: 'tasks' },
  { href: '/questions', label: 'questions', icon: 'chat' },
  { href: '/programs', label: 'programs', icon: 'flag' },
  { href: '/calendar', label: 'calendar', icon: 'calendar' },
  { href: '/mentors', label: 'mentors', icon: 'briefcase' },
  { href: '/notifications', label: 'notifications', icon: 'inbox' },
];

/** Admin-only group. For mentors these items are removed, not disabled. */
export const adminNav: readonly NavItem[] = [
  { href: '/overview', label: 'overview', icon: 'grid' },
  { href: '/team', label: 'team', icon: 'users' },
  { href: '/results', label: 'results', icon: 'chart' },
  { href: '/settings', label: 'settings', icon: 'sliders' },
];

/** Mobile bottom bar: 2 items, the «+» quick-add button, 2 items (design-system §3-1). */
export const staffTabbarStart: readonly NavItem[] = [staffNav[0], staffNav[1]] as NavItem[];
export const staffTabbarEnd: readonly NavItem[] = [staffNav[3], staffNav[4]] as NavItem[];

export const studentNav: readonly NavItem[] = [
  { href: '/home', label: 'home', icon: 'home' },
  { href: '/my/tasks', label: 'tasks', icon: 'tasks' },
  { href: '/my/questions', label: 'questions', icon: 'chat' },
  { href: '/my/path', label: 'path', icon: 'route' },
  { href: '/my/programs', label: 'programs', icon: 'flag' },
  { href: '/my/profile', label: 'me', icon: 'user' },
];

/** Mobile bottom bar keeps five tabs; «my programs» is reached from «my path» there. */
export const studentTabbar: readonly NavItem[] = studentNav.filter(
  (item) => item.href !== '/my/programs',
);

/** Badge numbers per nav href (e.g. unanswered questions). Filled by later sprints. */
export type NavCounts = Partial<Record<string, { value: number; label: string; tone?: CountTone }>>;

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
