import Link from "next/link";
import { NotificationBell } from "@/components/notification-bell";
import { NavLink } from "@/components/nav-link";
import { currentUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
          <Link href="/dashboard" className="flex items-baseline gap-0.5 font-serif text-xl tracking-tight text-ink">
            Stat<span className="text-brand-600">Tool</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            <NavLink href="/dashboard">Projects</NavLink>
            <NavLink href="/templates">Templates</NavLink>
            <NavLink href="/citations">Citing</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            {user.picture && <img src={user.picture} alt="" className="h-7 w-7 rounded-full" />}
            <span className="hidden text-sm text-slate-600 sm:inline">{user.name ?? user.email}</span>
            <a href="/auth/logout" className="text-sm text-slate-500 hover:text-ink">Log out</a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
