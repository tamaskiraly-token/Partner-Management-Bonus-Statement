"use client";

import * as React from "react";
import { Sidebar } from "@/components/app/Sidebar";

export function SidebarController({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);

  return (
    <div className="flex min-h-screen w-full">
      {open ? (
        <div className="no-print">
          <Sidebar onClose={() => setOpen(false)} />
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        {!open && (
          <div className="no-print px-4 pt-4">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white"
            >
              Show menu
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

