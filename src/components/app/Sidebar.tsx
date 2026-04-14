"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { QUARTERS } from "@/lib/quarters";

function getActiveQuarter(pathname: string): string | null {
  // Expected route: /statement/2026Q1
  const match = pathname.match(/\/statement\/([^/]+)/);
  return match?.[1] ?? null;
}

export function Sidebar({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const activeQuarter = getActiveQuarter(pathname);

  return (
    <aside className="hidden h-screen w-[240px] shrink-0 flex-col border-r border-slate-200/70 bg-white/40 px-3 py-6 backdrop-blur md:flex">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-white"
        >
          Hide menu
        </button>
      </div>

      <div className="flex items-start gap-3">
        <div className="grid size-12 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="text-center leading-[10px]">
            <div className="text-[11px] font-extrabold tracking-[0.18em] text-slate-900">
              TOK
            </div>
            <div className="text-[11px] font-extrabold tracking-[0.18em] text-slate-900">
              EN
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">Sales</div>
          <div className="truncate text-xs text-slate-600">Commercial Performance</div>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-200/70 pt-5">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Partner Management Bonus Statements
        </div>

        <nav className="mt-3 grid gap-2">
          {QUARTERS.map((q) => {
            const active = q === activeQuarter;
            return (
              <Link
                key={q}
                href={`/statement/${q}`}
                className={[
                  "group relative flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                  active
                    ? "border-sky-300 bg-white shadow-[0_0_0_2px_rgba(56,189,248,0.15)]"
                    : "border-transparent bg-white/20 text-slate-700 hover:border-sky-200 hover:bg-white/50 hover:text-slate-900",
                ].join(" ")}
              >
                <span className="truncate">{q}</span>
                <span
                  className={[
                    "ml-2 inline-flex size-5 items-center justify-center rounded-lg text-[11px] transition-opacity",
                    active ? "bg-sky-500 text-white opacity-100" : "bg-slate-100 text-slate-600 opacity-0 group-hover:opacity-100",
                  ].join(" ")}
                >
                  →
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto pt-5">
        <div className="text-xs text-slate-600">
          Partner management bonus statement template.
        </div>
      </div>
    </aside>
  );
}

