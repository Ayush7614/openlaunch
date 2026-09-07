import { Sk, SkPost } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-8 sm:pt-10 pb-16 space-y-6" aria-busy="true" aria-label="loading posts">
      <header className="space-y-3">
        <Sk className="h-9 w-24" />
        <Sk className="h-5 w-3/4 max-w-xl" />
      </header>
      <ul className="rounded-2xl bg-card border border-line shadow-card overflow-hidden">
        {Array.from({ length: 10 }, (_, i) => (
          <SkPost key={i} />
        ))}
      </ul>
    </main>
  );
}
