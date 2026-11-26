"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { cn } from "@/lib/utils";

type Item = { id: string; message: string; href: string | null; readAt: string | null; createdAt: string; kind: string };
const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function NotificationBell() {
  // Polling instead of websockets: works on Vercel and is plenty for "analysis ready".
  const { data, mutate } = useSWR<{ items: Item[]; unread: number }>("/api/notifications", fetcher, {
    refreshInterval: 10_000,
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", { method: "POST", body: "{}" });
    mutate();
  }

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-brand-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.items.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Nothing yet.</li>}
            {data?.items.map((n) => (
              <li key={n.id} className={cn("border-b border-slate-50 last:border-0", !n.readAt && "bg-brand-50/50")}>
                <Link
                  href={n.href ?? "/dashboard"}
                  onClick={() => {
                    setOpen(false);
                    fetch("/api/notifications", { method: "POST", body: JSON.stringify({ ids: [n.id] }) }).then(() => mutate());
                  }}
                  className="block px-4 py-3 hover:bg-slate-50"
                >
                  <p className="text-sm text-slate-800">{n.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
