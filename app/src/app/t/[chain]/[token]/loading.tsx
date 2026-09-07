import { Sk, SkStat } from "@/components/Skeleton";

/** Token page skeleton: header, chart, stats, trades on the left; trade panel on the right. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 sm:pt-8 pb-24 space-y-6" aria-busy="true" aria-label="loading token">
      <header className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <Sk className="h-[72px] w-[72px] rounded-2xl hidden sm:block shrink-0" />
        <Sk className="h-12 w-12 rounded-xl sm:hidden" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <Sk className="h-8 w-48" />
            <Sk className="h-6 w-16 rounded-full" />
          </div>
          <Sk className="h-4 w-80 max-w-full" />
          <div className="flex gap-2">
            <Sk className="h-7 w-24 rounded-full" />
            <Sk className="h-7 w-28 rounded-full" />
            <Sk className="h-7 w-20 rounded-full" />
          </div>
        </div>
        <div className="sm:text-right shrink-0 space-y-2">
          <Sk className="h-9 w-28 sm:ml-auto" />
          <Sk className="h-3.5 w-24 sm:ml-auto" />
        </div>
      </header>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="min-w-0 space-y-6 order-2 lg:order-1">
          <div className="rounded-2xl bg-card border border-line shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <Sk className="h-7 w-40 rounded-full" />
              <Sk className="h-7 w-32 rounded-full" />
            </div>
            <Sk className="h-64 sm:h-80 w-full rounded-xl" />
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {Array.from({ length: 6 }, (_, i) => (
              <SkStat key={i} />
            ))}
          </dl>
          <div className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
            <div className="px-4 py-3">
              <Sk className="h-4 w-24" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="px-4 py-2.5 border-t border-line flex items-center gap-4">
                <Sk className="h-3.5 w-10" />
                <Sk className="h-3.5 w-24" />
                <Sk className="h-3.5 w-20 ml-auto" />
                <Sk className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-4 order-1 lg:order-2">
          <div className="rounded-2xl bg-card border border-line shadow-card p-4 space-y-3">
            <Sk className="h-9 w-full rounded-full" />
            <Sk className="h-12 w-full rounded-xl" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Sk key={i} className="h-8 flex-1 rounded-full" />
              ))}
            </div>
            <Sk className="h-12 w-full rounded-xl" />
          </div>
          <div className="rounded-2xl bg-card border border-line shadow-card p-4 space-y-2">
            <Sk className="h-4 w-28" />
            <Sk className="h-3.5 w-full" />
            <Sk className="h-3.5 w-2/3" />
          </div>
        </div>
      </div>
    </main>
  );
}
