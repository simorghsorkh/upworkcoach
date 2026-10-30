import { redirect } from 'next/navigation';

/** M2a has no page of its own: the "New student" dialog opens on the students list. */
export default function Page() {
  redirect('/students?new=1');
}
