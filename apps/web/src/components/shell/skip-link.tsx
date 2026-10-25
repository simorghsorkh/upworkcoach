/** «پرش به محتوا» — first focusable element of every shell (design-system §8). */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="absolute start-3 -top-16 z-[200] rounded-sm bg-primary px-4 py-2 font-semibold text-on-brand focus:top-3"
    >
      پرش به محتوا
    </a>
  );
}
