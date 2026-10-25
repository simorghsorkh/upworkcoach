import type { Metadata } from 'next';
import {
  CannedResponsesSettings,
  MilestoneTypesSettings,
} from '@/components/settings/catalog-lists';
import { PlatformsSettings } from '@/components/settings/platforms-settings';
import {
  AccessSettingsForm,
  CheckinSettingsForm,
  HealthRulesForm,
  SlaSettingsForm,
} from '@/components/settings/settings-forms';
import { StagesSettings } from '@/components/settings/stages-settings';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  getSettings,
  listCannedResponses,
  listMilestoneTypes,
  listPlatforms,
  listStages,
  listTracks,
} from '@/modules/catalog/service';
import { requireUser, toActor } from '@/server/auth/current-user';

export const metadata: Metadata = { title: 'تنظیمات' };

const SECTIONS = [
  ['#stages', 'مراحل'],
  ['#platforms', 'پلتفرم‌ها'],
  ['#health', 'آستانه‌های سلامت'],
  ['#sla', 'زمان پاسخ'],
  ['#checkin', 'check-in'],
  ['#access', 'دسترسی'],
  ['#milestone-types', 'نقاط عطف'],
  ['#canned', 'متن‌های استاندارد'],
] as const;

/** M11 — settings (admin only; the (admin) layout already redirects mentors). */
export default async function SettingsPage() {
  const user = await requireUser(['admin']);
  const actor = toActor(user);
  const [stages, platforms, tracks, settings, types, canned] = await Promise.all([
    listStages(actor, { includeInactive: true }),
    listPlatforms(actor, { includeInactive: true }),
    listTracks(actor),
    getSettings(actor),
    listMilestoneTypes(actor, { includeInactive: true }),
    listCannedResponses(actor, { includeInactive: true }),
  ]);
  return (
    <>
      <PageHead title="تنظیمات" sub="تغییرها بلافاصله در همه‌ی صفحه‌ها دیده می‌شوند." />
      <nav
        aria-label="بخش‌های تنظیمات"
        className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
      >
        {SECTIONS.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-[34px] flex-none items-center rounded-full border border-line-2 bg-surface px-3 text-sm font-medium text-fg hover:border-line-strong"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="grid items-start gap-4 md:gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card id="stages" aria-label="مراحل مسیر" className="scroll-mt-20">
            <StagesSettings stages={stages} />
          </Card>
          <Card id="health" aria-labelledby="h-health" className="scroll-mt-20">
            <HealthRulesForm value={settings['health.rules'].value} />
          </Card>
          <Card id="canned" aria-labelledby="h-cr" className="scroll-mt-20">
            <CannedResponsesSettings items={canned} />
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card id="platforms" aria-label="پلتفرم‌ها" className="scroll-mt-20">
            <PlatformsSettings platforms={platforms} tracks={tracks} />
          </Card>
          <Card id="sla" aria-labelledby="h-sla" className="scroll-mt-20">
            <SlaSettingsForm sla={settings.sla.value} questions={settings.questions.value} />
          </Card>
          <Card id="checkin" aria-labelledby="h-checkin" className="scroll-mt-20">
            <CheckinSettingsForm value={settings.checkin.value} />
          </Card>
          <Card id="access" aria-labelledby="h-access" className="scroll-mt-20">
            <AccessSettingsForm value={settings.access.value} />
          </Card>
          <Card id="milestone-types" aria-labelledby="h-mt" className="scroll-mt-20">
            <MilestoneTypesSettings types={types} />
          </Card>
        </div>
      </div>
    </>
  );
}
