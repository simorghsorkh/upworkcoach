import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';

/** Missing or out of scope: the same answer (ADR-0004), no hint about which. */
export default function StudentNotFound() {
  return (
    <Card className="mt-4">
      <EmptyState
        icon="users"
        title="این پرونده پیدا نشد"
        headingLevel={1}
        action={
          <Link href="/students" className={buttonClass()}>
            بازگشت به هنرجوها
          </Link>
        }
      >
        شاید حذف شده یا به مشاور دیگری سپرده شده است.
      </EmptyState>
    </Card>
  );
}
