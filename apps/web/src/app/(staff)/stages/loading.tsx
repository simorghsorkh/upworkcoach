import { PageHead } from '@/components/ui/page-head';
import { SkeletonRows } from '@/components/ui/states';

export default function Loading() {
  return (
    <>
      <PageHead title="مراحل مسیر" />
      <div className="grid grid-flow-col auto-cols-[272px] gap-3 overflow-hidden max-md:auto-cols-[85%]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="min-h-60 rounded-lg border border-line bg-surface-2 p-3">
            <SkeletonRows rows={3} label={i === 0 ? 'در حال بارگذاری مراحل…' : ''} />
          </div>
        ))}
      </div>
    </>
  );
}
