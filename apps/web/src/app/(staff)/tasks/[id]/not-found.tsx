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
        action={<ButtonLink href="/tasks">رفتن به کارها</ButtonLink>}
      >
        شاید حذف شده یا هنرجویش به مشاور دیگری سپرده شده است.
      </EmptyState>
    </Card>
  );
}
