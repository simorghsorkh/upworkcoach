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
        action={<ButtonLink href="/my/questions">سؤال‌های من</ButtonLink>}
      >
        شاید لینک اشتباه است. سؤال‌هایت همه در «سؤال‌های من» هستند.
      </EmptyState>
    </Card>
  );
}
