"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Mark, { Wordmark } from "./launchpad/Mark";
import ConnectButton from "./ConnectButton";
import Sheet from "./Sheet";
import LivePulse from "./launchpad/LivePulse";

const NAV = [
  { href: "/", label: "Launchpad" },
  { href: "/feed", label: "Posts" },
  { href: "/rules", label: "How it works" },
  { href: "/agents", label: "Agents" },
  { href: "/me", label: "Me" },
];

export default function HeaderNav({ pulse }: { pulse: { visits: number; online: number } }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="openlaunch.lol home">
          <Mark size={24} />
          <Wordmark />
        </Link>
        <LivePulse initial={pulse} />

        <nav className="hidden md:flex items-center gap-0.5 lg:gap-1 ml-1 lg:ml-3">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/t/") : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`px-2.5 lg:px-3 h-9 inline-flex items-center rounded-lg text-sm font-medium whitespace-nowrap ${active ? "text-ink bg-card shadow-card" : "text-body hover:text-ink hover:bg-card"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 min-w-0">
          <Link href="/launch" className="inline-flex items-center h-9 px-3.5 rounded-xl bg-brand text-inverse text-[13px] font-semibold hover:bg-brand-strong whitespace-nowrap">
            Launch<span className="hidden sm:inline">&nbsp;a token</span>
          </Link>
          <div className="hidden md:block">
            <ConnectButton />
          </div>
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-xl border border-line bg-card text-ink hover:border-line-strong">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2.5 5h13M2.5 9h13M2.5 13h13" />
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <Sheet title="Menu" onClose={() => setOpen(false)}>
          <nav className="flex flex-col gap-1 pb-3">
            {[{ href: "/launch", label: "Launch a token · free" }, ...NAV].map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`min-h-12 px-3 inline-flex items-center rounded-xl text-base font-medium ${active ? "bg-brand-soft text-brand" : "text-ink hover:bg-paper"}`}>
                  {n.label}
                </Link>
              );
            })}
            <div className="sm:hidden">
              <LivePulse initial={pulse} block />
            </div>
          </nav>
          <div className="border-t border-line pt-4 space-y-3">
            <ConnectButton block />
          </div>
        </Sheet>
      ) : null}
    </header>
  );
}
