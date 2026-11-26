"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/dashboard" ? path === "/dashboard" || path.startsWith("/projects") : path.startsWith(href);
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cn("rounded-[var(--radius-control)] px-2.5 py-1.5", active ? "bg-white text-ink ring-1 ring-rule" : "text-slate-600 hover:text-ink")}>
      {children}
    </Link>
  );
}
