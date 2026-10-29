'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { apiPut } from '@/components/api/client';
import { faNumber, toLatinDigits } from '@/components/format/fa';
import { CheckboxField } from '@/components/forms/form-utils';
import { ruleTitle } from '@/components/health/reasons';
import { Icon } from '@/components/icons/icon';
import { RuleCode } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioCards } from '@/components/ui/choice';
import { SelectField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type {
  AccessSettings,
  CheckinSettings,
  HealthRules,
  QuestionsSettings,
  SettingsKey,
  SlaSettings,
  Weekday,
} from '@/modules/catalog/contracts';

/**
 * M11 settings forms (F11): each section saves its own key with `PUT /settings/{key}` (the
 * body is the value). `health.rules` and `checkin` re-evaluate every student at once.
 */

function useSave(key: SettingsKey, okMessage: string) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function save(value: unknown) {
    setSaving(true);
    setError(null);
    setFields({});
    const res = await apiPut(`/api/v1/settings/${encodeURIComponent(key)}`, value);
    setSaving(false);
    if (res.ok) {
      toast.show({ message: okMessage });
      router.refresh();
      return true;
    }
    setFields(res.error.fields);
    setError(
      Object.keys(res.error.fields).length
        ? (Object.values(res.error.fields)[0] ?? res.error.message)
        : res.error.message,
    );
    return false;
  }
  return { save, saving, error, fields };
}

/** Number box that accepts Persian digits; `null` when not a number. */
function num(text: string): number | null {
  const t = toLatinDigits(text.trim()).replace('٫', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function Section({
  id,
  title,
  sub,
  children,
}: {
  id: string;
  title: string;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <h2 id={id} className="mb-1 text-h2">
        {title}
      </h2>
      {sub ? <p className="mb-4 text-sm text-fg-3">{sub}</p> : <div className="mb-3" />}
      {children}
    </>
  );
}

function SaveRow({ saving, error }: { saving: boolean; error: string | null }) {
  return (
    <>
      {error ? <Alert tone="error" role="alert" title={error} /> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={saving} className="max-md:w-full">
          ذخیره
        </Button>
      </div>
    </>
  );
}

// ---- access ---------------------------------------------------------------------------

export function AccessSettingsForm({ value }: { value: AccessSettings }) {
  const [scope, setScope] = useState(value.mentorScope);
  const [invite, setInvite] = useState(value.mentorsCanInviteStudents);
  const [groupRuns, setGroupRuns] = useState(value.mentorsCanCreateGroupRuns ?? false);
  const t = useTranslations('settingsAccess');
  const s = useSave('access', 'دسترسی مشاورها ذخیره شد.');
  return (
    <Section id="h-access" title="دسترسی مشاورها">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void s.save({
            mentorScope: scope,
            mentorsCanInviteStudents: invite,
            mentorsCanCreateGroupRuns: groupRuns,
          });
        }}
      >
        <RadioCards
          legend="مشاور کدام هنرجوها را می‌بیند؟"
          value={scope}
          onChange={setScope}
          stack
          options={[
            { value: 'assigned', label: 'فقط هنرجوهای خودش' },
            { value: 'all', label: 'همه‌ی هنرجوها' },
          ]}
        />
        <CheckboxField
          label="مشاورها می‌توانند هنرجوی جدید دعوت کنند"
          checked={invite}
          onChange={(e) => setInvite(e.target.checked)}
          hint="خاموش باشد، دکمه‌ی «هنرجوی جدید» برای مشاورها نمایش داده نمی‌شود."
        />
        <CheckboxField
          label={t('groupRuns')}
          checked={groupRuns}
          onChange={(e) => setGroupRuns(e.target.checked)}
          hint={t('groupRunsHint')}
        />
        <SaveRow saving={s.saving} error={s.error} />
      </form>
    </Section>
  );
}

// ---- check-in -------------------------------------------------------------------------

const WEEKDAY_LABEL: Record<Weekday, string> = {
  sat: 'شنبه',
  sun: 'یکشنبه',
  mon: 'دوشنبه',
  tue: 'سه‌شنبه',
  wed: 'چهارشنبه',
  thu: 'پنجشنبه',
  fri: 'جمعه',
};

export function CheckinSettingsForm({ value }: { value: CheckinSettings }) {
  const [enabled, setEnabled] = useState(value.enabled);
  const [weekday, setWeekday] = useState<Weekday>(value.weekday);
  const s = useSave('checkin', 'تنظیم check-in ذخیره شد.');
  return (
    <Section
      id="h-checkin"
      title="check-in هفتگی"
      sub="فرم ۳ دقیقه‌ای هنرجو؛ از روز انتخاب‌شده تا پایان جمعه باز است."
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void s.save({ enabled, weekday });
        }}
      >
        <CheckboxField
          label="check-in هفتگی روشن باشد"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          hint="خاموش باشد، کارتش از خانه‌ی هنرجو می‌رود و قاعده‌های R-CHECKIN و R-MOOD حساب نمی‌شوند."
        />
        <SelectField
          label="روز باز شدن فرم"
          value={weekday}
          onChange={(e) => setWeekday(e.target.value as Weekday)}
          disabled={!enabled}
        >
          {(Object.keys(WEEKDAY_LABEL) as Weekday[]).map((d) => (
            <option key={d} value={d}>
              {WEEKDAY_LABEL[d]}
            </option>
          ))}
        </SelectField>
        <SaveRow saving={s.saving} error={s.error} />
      </form>
    </Section>
  );
}

// ---- SLA + expected response text -------------------------------------------------------

export function SlaSettingsForm({
  sla,
  questions,
}: {
  sla: SlaSettings;
  questions: QuestionsSettings;
}) {
  const [v, setV] = useState({
    questionHours: String(sla.questionHours),
    urgentQuestionHours: String(sla.urgentQuestionHours),
    reviewHours: String(sla.reviewHours),
    redNoActionHours: String(sla.redNoActionHours),
    redEscalateDays: String(sla.redEscalateDays),
  });
  const [clock, setClock] = useState(sla.clock);
  const [text, setText] = useState(questions.expectedResponseText);
  const [bad, setBad] = useState<Record<string, string>>({});
  const s = useSave('sla', 'زمان‌های پاسخ ذخیره شد.');
  const q = useSave('questions', 'متن زمان پاسخ ذخیره شد.');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const out: Record<string, number> = {};
    const errs: Record<string, string> = {};
    for (const [k, raw] of Object.entries(v)) {
      const n = num(raw);
      if (n === null || n <= 0) errs[k] = 'عدد مثبت بنویس.';
      else out[k] = n;
    }
    if (!text.trim()) errs.text = 'متن زمان پاسخ را بنویس.';
    setBad(errs);
    if (Object.keys(errs).length) return;
    const ok = await s.save({ ...out, clock });
    if (ok && text.trim() !== questions.expectedResponseText) {
      await q.save({ expectedResponseText: text.trim() });
    }
  }

  const field = (k: keyof typeof v, label: string, unit: string) => (
    <TextField
      label={label}
      inputMode="decimal"
      value={v[k]}
      onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))}
      error={bad[k] ?? s.fields[k]}
      hint={unit}
    />
  );

  return (
    <Section
      id="h-sla"
      title="زمان پاسخ (SLA)"
      sub="در «امروز» و صف سؤال‌ها، موردهای دیرشده با این عددها قرمز می‌شوند."
    >
      <form noValidate onSubmit={onSubmit}>
        <div className="grid gap-x-3 sm:grid-cols-2">
          {field('questionHours', 'پاسخ به سؤال', 'ساعت')}
          {field('urgentQuestionHours', 'پاسخ به سؤال فوری', 'ساعت')}
          {field('reviewHours', 'بازبینی تحویل', 'ساعت')}
          {field('redNoActionHours', 'اقدام برای هنرجوی قرمز', 'ساعت')}
          {field('redEscalateDays', 'ارجاع به بنیان‌گذار پس از', 'روز قرمز بدون اقدام')}
        </div>
        <RadioCards
          legend="ساعت‌ها چطور شمرده شوند؟"
          value={clock}
          onChange={setClock}
          options={[
            { value: 'business', label: 'ساعت کاری' },
            { value: 'calendar', label: 'شبانه‌روزی' },
          ]}
        />
        <TextField
          label="متنی که هنرجو زیر فرم سؤال می‌بیند"
          value={text}
          onChange={(e) => setText(e.target.value)}
          error={bad.text ?? q.error}
          maxLength={120}
          hint="مثلاً «معمولاً تا ۲۴ ساعت»"
        />
        <SaveRow saving={s.saving || q.saving} error={s.error} />
      </form>
    </Section>
  );
}

// ---- health rules ---------------------------------------------------------------------

type Pair = {
  key: keyof HealthRules;
  code: keyof typeof ruleTitle;
  y: string;
  r: string;
  unit: string;
};
const PAIRS: Pair[] = [
  { key: 'inactivity', code: 'R-INACT', y: 'yellowDays', r: 'redDays', unit: 'روز' },
  { key: 'stall', code: 'R-STALL', y: 'yellowFactor', r: 'redFactor', unit: 'برابر زمان معمول' },
  { key: 'overdue', code: 'R-OVERDUE', y: 'yellowDays', r: 'redDays', unit: 'روز معوق' },
  { key: 'loop', code: 'R-LOOP', y: 'yellowRevisions', r: 'redRevisions', unit: 'دور اصلاح' },
  { key: 'noTask', code: 'R-NOTASK', y: 'yellowDays', r: 'redDays', unit: 'روز بی‌کار' },
  { key: 'checkin', code: 'R-CHECKIN', y: 'yellowWeeks', r: 'redWeeks', unit: 'هفته' },
];

type Flat = Record<string, string>;

function flatten(rules: HealthRules): Flat {
  const out: Flat = {};
  for (const [k, obj] of Object.entries(rules)) {
    for (const [f, val] of Object.entries(obj as Record<string, number>)) {
      out[`${k}.${f}`] = String(val);
    }
  }
  return out;
}

export function HealthRulesForm({ value }: { value: HealthRules }) {
  const [v, setV] = useState<Flat>(() => flatten(value));
  const [bad, setBad] = useState<Record<string, string>>({});
  const s = useSave('health.rules', 'آستانه‌ها ذخیره شد؛ سلامت همه‌ی هنرجوها دوباره حساب شد.');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const out: Record<string, Record<string, number>> = {};
    const errs: Record<string, string> = {};
    for (const [path, raw] of Object.entries(v)) {
      const [k, f] = path.split('.') as [string, string];
      const n = num(raw);
      if (n === null || n < 0) {
        errs[path] = 'عدد بنویس.';
        continue;
      }
      out[k] = { ...(out[k] ?? {}), [f]: n };
    }
    for (const p of PAIRS) {
      const y = num(v[`${p.key}.${p.y}`] ?? '');
      const r = num(v[`${p.key}.${p.r}`] ?? '');
      if (y !== null && r !== null && r < y)
        errs[`${p.key}.${p.r}`] = 'قرمز نباید از زرد کمتر باشد.';
    }
    setBad(errs);
    if (Object.keys(errs).length) return;
    await s.save(out);
  }

  const box = (path: string, label: string) => (
    <TextField
      label={label}
      inputMode="decimal"
      value={v[path] ?? ''}
      onChange={(e) => setV((x) => ({ ...x, [path]: e.target.value }))}
      error={bad[path] ?? s.fields[path.split('.')[0] ?? '']}
      fieldClassName="mb-0"
    />
  );

  return (
    <Section
      id="h-health"
      title="آستانه‌های سلامت"
      sub="وضعیت هر هنرجو = بدترین قاعده‌ی فعال. ذخیره، سلامت همه را بلافاصله دوباره حساب می‌کند."
    >
      <form noValidate onSubmit={onSubmit}>
        <ul className="mb-5 flex flex-col gap-4">
          {PAIRS.map((p) => (
            <li key={p.key} className="rounded-md border border-line bg-bg p-3">
              <p className="mb-2 flex flex-wrap items-center gap-2 text-ui font-semibold">
                {ruleTitle[p.code]} <RuleCode>{p.code}</RuleCode>
                <span className="text-xs font-normal text-fg-3">{p.unit}</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {box(`${p.key}.${p.y}`, 'زرد از')}
                {box(`${p.key}.${p.r}`, 'قرمز از')}
              </div>
            </li>
          ))}
          <li className="rounded-md border border-line bg-bg p-3">
            <p className="mb-2 flex flex-wrap items-center gap-2 text-ui font-semibold">
              {ruleTitle['R-OVERDUE']} (چند کار) <RuleCode>R-OVERDUE</RuleCode>
            </p>
            <div className="grid grid-cols-2 gap-3">
              {box('overdue.redCount', 'قرمز با این تعداد کار معوق')}
              {box('overdue.redCountMinDays', 'هر کدام دست‌کم (روز)')}
            </div>
          </li>
          <li className="rounded-md border border-line bg-bg p-3">
            <p className="mb-2 flex flex-wrap items-center gap-2 text-ui font-semibold">
              {ruleTitle['R-EXTEND']} و {ruleTitle['R-MOOD']}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {box('extend.yellowExtensions', 'زرد از (بار تمدید)')}
              {box('mood.maxMood', 'حال کمتر یا برابر')}
              {box('mood.redConsecutiveWeeks', 'قرمز پس از (هفته‌ی پیاپی)')}
            </div>
          </li>
          <li className="rounded-md border border-line bg-bg p-3">
            <p className="mb-2 text-ui font-semibold">خطر ریزش</p>
            {box('churnRisk.minRules', 'چند قاعده از R-INACT، R-CHECKIN و R-MOOD هم‌زمان')}
          </li>
        </ul>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-fg-3">
          <Icon name="info" size={14} />
          {`پیش‌فرض‌ها: بی‌فعالیتی ${faNumber(7)}/${faNumber(14)} روز، معوق ${faNumber(3)}/${faNumber(7)} روز، اصلاح ${faNumber(3)}/${faNumber(4)} دور.`}
        </p>
        <SaveRow saving={s.saving} error={s.error} />
      </form>
    </Section>
  );
}
