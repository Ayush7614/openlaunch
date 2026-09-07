import { Sk, SkPost, SkRow, SkStat } from "@/components/Skeleton";

/** Home skeleton: hero + totals, list header, rows, side column. Same grid as page.tsx so nothing shifts. */
export default function Loading() {
  return (
    <main className="relative mx-auto max-w-6xl px-4 pb-16 space-y-8" aria-busy="true" aria-label="loading">
      <section className="pt-8 sm:pt-12 grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-8 items-start">
        <div className="space-y-4">
          <Sk className="h-12 sm:h-14 w-4/5" />
          <Sk className="h-12 sm:h-14 w-3/5" />
          <Sk className="h-5 w-2/3 mt-6" />
          <Sk className="h-5 w-1/2" />
          <div className="flex gap-3 pt-2">
            <Sk className="h-12 w-44 rounded-xl" />
            <Sk className="h-12 w-32 rounded-xl" />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2.5">
          <SkStat />
          <SkStat />
          <SkStat />
          <SkStat />
        </dl>
      </section>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Sk className="h-7 w-32" />
            <Sk className="h-11 w-72 max-w-full rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Sk className="h-8 w-56 rounded-full" />
            <Sk className="h-8 w-80 max-w-full rounded-full ml-auto" />
          </div>
          <ul className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
            {Array.from({ length: 8 }, (_, i) => (
              <SkRow key={i} i={i} />
            ))}
          </ul>
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <Sk className="h-4 w-14" />
              <Sk className="h-3 w-16" />
            </div>
            <ul>
              {Array.from({ length: 4 }, (_, i) => (
                <SkPost key={i} />
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
            <div className="px-4 py-3">
              <Sk className="h-4 w-20" />
            </div>
            <ul>
              {Array.from({ length: 6 }, (_, i) => (
                <SkPost key={i} />
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
