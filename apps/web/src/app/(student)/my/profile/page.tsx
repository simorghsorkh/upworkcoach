import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { faDate, faNumber } from '@/components/format/fa';
import { ProfilesManager } from '@/components/profiles/profiles-manager';
import { priorExperienceLabel } from '@/components/students/labels';
import { SelfEditButton } from '@/components/students/self-edit-form';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { toLocalMobile } from '@/lib/phone';
import { listPlatforms } from '@/modules/catalog/service';
import { listOwnProfiles } from '@/modules/students/service';
import { NoRecord } from '../../_components';
import { loadOwn } from '../../_load';

export const metadata: Metadata = { title: 'من' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * S7 — "Me": my platform profiles (add, edit, delete) and my own information, which I can
 * edit (`PATCH /me/student`, whitelist only). `?edit=1` opens the editor.
 */
export default async function MyProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { actor, student } = await loadOwn();
  if (!student) return <NoRecord />;
  const [profiles, platforms] = await Promise.all([listOwnProfiles(actor), listPlatforms(actor)]);
  const rows: Array<[string, ReactNode]> = [
    [
      'موبایل',
      <bdi key="phone" dir="ltr">
        {toLocalMobile(student.phone)}
      </bdi>,
    ],
    ['مشاور', student.mentor?.displayName ?? null],
    ['مرحله', `${student.stage.displayCode} ${student.stage.name}`],
    [
      'پیام‌رسان',
      student.messengerHandle ? (
        <bdi key="m" dir="ltr">
          {student.messengerHandle}
        </bdi>
      ) : null,
    ],
    ['پلتفرم اصلی', student.primaryPlatform?.name ?? null],
    [
      'مهارت اصلی',
      student.primarySkill
        ? [student.primarySkill, student.skillLevel ? `${faNumber(student.skillLevel)} از ۵` : null]
            .filter(Boolean)
            .join(' · ')
        : null,
    ],
    [
      'انگلیسی',
      student.englishWriting !== null || student.englishSpeaking !== null
        ? `نوشتاری ${student.englishWriting === null ? '—' : faNumber(student.englishWriting)} · گفتاری ${student.englishSpeaking === null ? '—' : faNumber(student.englishSpeaking)}`
        : null,
    ],
    [
      'وقت در هفته',
      student.hoursPerWeek === null ? null : `${faNumber(student.hoursPerWeek)} ساعت`,
    ],
    [
      'هدف درآمد',
      student.incomeGoalUsd === null
        ? null
        : `${faNumber(student.incomeGoalUsd, { grouped: true })} دلار در ماه`,
    ],
    ['هدف ۹۰ روزه', student.goal90d],
    ['تجربه‌ی قبلی', student.priorExperience ? priorExperienceLabel[student.priorExperience] : null],
    ['مانع اصلی', student.selfReportedBlocker],
    ['عضویت', faDate(new Date(student.joinedAt))],
  ];
  return (
    <>
      <PageHead
        title="من"
        sub="لینک پروفایل‌هایت را خودت اضافه یا به‌روز کن؛ مشاورت همین‌ها را می‌بیند."
      />
      <div className="flex flex-col gap-4 md:gap-5">
        <Card aria-labelledby="h-my-profiles">
          <ProfilesManager
            mode="student"
            profiles={profiles}
            platforms={platforms}
            createUrl="/api/v1/me/profiles"
            headingId="h-my-profiles"
          />
        </Card>
        <Card id="about" aria-labelledby="h-me" className="scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="h-me" className="text-h2">
              اطلاعات من
            </h2>
            <SelfEditButton
              student={student}
              platforms={platforms.map((p) => ({ id: p.id, name: p.name }))}
              initiallyOpen={sp.edit === '1'}
            />
          </div>
          <dl className="m-0 grid grid-cols-1 text-ui md:grid-cols-[max-content_minmax(0,1fr)] md:gap-x-5 md:gap-y-2.5">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-xs text-fg-3 md:text-ui">{k}</dt>
                <dd className="m-0 mb-3 min-w-0 font-medium whitespace-pre-line md:mb-0">
                  {v ?? <span className="text-fg-3">—</span>}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-fg-3">موبایل، مشاور و مرحله را مربی‌ات عوض می‌کند.</p>
        </Card>
      </div>
    </>
  );
}
