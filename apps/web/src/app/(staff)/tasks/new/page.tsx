import { redirect } from 'next/navigation';

/** M5a lives as a sheet on /tasks (sitemap §3); this keeps the old link working. */
export default function NewTaskPage() {
  redirect('/tasks?new=1');
}
