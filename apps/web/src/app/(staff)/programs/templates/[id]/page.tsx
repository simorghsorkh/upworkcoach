import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { TemplateEditor } from '@/components/programs/template-editor';
import { getStaffSettings, listMilestoneTypes } from '@/modules/catalog/service';
import { getTemplate } from '@/modules/programs/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('programTemplate') };
}

/** One program template: details, phases and activities, and its life cycle (ADR-0012). */
export default async function ProgramTemplatePage({ params }: { params: Params }) {
  const user = await requireUser(['admin', 'mentor']);
  const { id } = await params;
  try {
    const actor = toActor(user);
    const [template, settings, milestoneTypes] = await Promise.all([
      getTemplate(actor, id),
      getStaffSettings(actor).catch(() => null),
      listMilestoneTypes(actor),
    ]);
    const isAdmin = user.role === 'admin';
    return (
      <TemplateEditor
        template={template}
        isAdmin={isAdmin}
        canGroup={isAdmin || (settings?.access.mentorsCanCreateGroupRuns ?? false)}
        milestoneTypes={milestoneTypes.map((m) => ({ id: m.id, label: m.name }))}
      />
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) notFound();
    throw err;
  }
}
