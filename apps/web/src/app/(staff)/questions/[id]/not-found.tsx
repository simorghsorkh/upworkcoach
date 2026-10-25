import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';

export default function QuestionNotFound() {
  return (
    <Card>
      <EmptyState
        icon="chat"
        title="این سؤال پیدا نشد"
        headingLevel={1}
        action={<ButtonLink href="/questions">صف سؤال‌ها</ButtonLink>}
      >
        شاید بسته شده و دیگر به تو سپرده نیست، یا هنرجویش به مشاور دیگری رفته است.
      </EmptyState>
    </Card>
  );
}
