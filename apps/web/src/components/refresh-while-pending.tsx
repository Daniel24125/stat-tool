"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page every few seconds while something is still running. */
export function RefreshWhilePending({ pending, intervalMs = 2000 }: { pending: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [pending, intervalMs, router]);
  return null;
}
