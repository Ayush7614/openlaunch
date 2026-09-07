import { Sk, SkRow, SkStat } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-4 pt-8 sm:pt-10 pb-16 space-y-6" aria-busy="true" aria-label="loading dashboard">
      <header className="space-y-3">
        <Sk className="h-9 w-20" />
        <Sk className="h-5 w-3/4 max-w-xl" />
      </header>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }, (_, i) => (
          <SkStat key={i} />
        ))}
      </dl>
      <ul className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <SkRow key={i} i={i} />
        ))}
      </ul>
    </main>
  );
}
