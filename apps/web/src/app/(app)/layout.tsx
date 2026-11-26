import Link from "next/link";
import { Sigma } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { currentUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Sigma className="h-5 w-5 text-brand-600" /> StatTool
          </Link>
          <nav className="flex gap-4 text-sm text-slate-600">
            <Link href="/dashboard" className="hover:text-slate-900">Dashboard</Link>
            <Link href="/citations" className="hover:text-slate-900">Citing</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <span className="hidden text-sm text-slate-600 sm:inline">{user.name ?? user.email}</span>
            {user.picture && <img src={user.picture} alt="" className="h-8 w-8 rounded-full" />}
            <a href="/auth/logout" className="text-sm text-slate-500 hover:text-slate-900">Log out</a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
