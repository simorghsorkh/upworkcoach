import type { IconName } from '@/components/icons/icon';
import type { CountTone } from '@/components/ui/badge';

/** Navigation of docs/03-ux/sitemap.md §3 (staff) and §4 (student). */
export type NavItem = { href: string; label: string; icon: IconName };

export const staffNav: readonly NavItem[] = [
  { href: '/today', label: 'امروز', icon: 'today' },
  { href: '/students', label: 'هنرجوها', icon: 'users' },
  { href: '/stages', label: 'مراحل', icon: 'board' },
  { href: '/tasks', label: 'کارها', icon: 'tasks' },
  { href: '/questions', label: 'سؤال‌ها', icon: 'chat' },
];

/** Admin-only group. For mentors these items are removed, not disabled. */
export const adminNav: readonly NavItem[] = [
  { href: '/team', label: 'تیم', icon: 'users' },
  { href: '/results', label: 'نتایج', icon: 'chart' },
  { href: '/settings', label: 'تنظیمات', icon: 'sliders' },
];

/** Mobile bottom bar: 2 items, the «+» quick-add button, 2 items (design-system §3-1). */
export const staffTabbarStart: readonly NavItem[] = [staffNav[0], staffNav[1]] as NavItem[];
export const staffTabbarEnd: readonly NavItem[] = [staffNav[3], staffNav[4]] as NavItem[];

export const studentNav: readonly NavItem[] = [
  { href: '/home', label: 'خانه', icon: 'home' },
  { href: '/my/tasks', label: 'کارها', icon: 'tasks' },
  { href: '/my/questions', label: 'سؤال‌ها', icon: 'chat' },
  { href: '/my/path', label: 'مسیر', icon: 'route' },
  { href: '/my/profile', label: 'من', icon: 'user' },
];

/** Badge numbers per nav href (e.g. unanswered questions). Filled by later sprints. */
export type NavCounts = Partial<Record<string, { value: number; label: string; tone?: CountTone }>>;

export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const roleLabel = { admin: 'مدیر', mentor: 'مشاور', student: 'هنرجو' } as const;
