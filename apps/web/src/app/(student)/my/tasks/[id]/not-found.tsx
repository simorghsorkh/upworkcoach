import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';

export default function TaskNotFound() {
  return (
    <Card>
      <EmptyState
        icon="tasks"
        title="این کار پیدا نشد"
        headingLevel={1}
        action={<ButtonLink href="/my/tasks">کارهای من</ButtonLink>}
      >
        شاید مشاورت آن را برداشته باشد.
      </EmptyState>
    </Card>
  );
}
