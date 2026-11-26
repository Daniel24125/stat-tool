"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { addMember, removeMember, updateMemberRole } from "@/app/actions";
import { Badge, Button, Input, Select } from "@/components/ui";

type Role = "OWNER" | "EDITOR" | "VIEWER";
type Member = { userId: string; role: Role; name: string | null; email: string | null; picture: string | null };
type Found = { id: string; name: string | null; email: string; picture: string | null };

export function MembersPanel({ projectId, members, meId, isOwner }: { projectId: string; members: Member[]; meId: string; isOwner: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [role, setRole] = useState<Role>("VIEWER");
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!isOwner || q.trim().length < 3) return setResults([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/users/search?projectId=${projectId}&q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setResults(d.users ?? []))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, projectId, isOwner]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(success); router.refresh(); } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      {isOwner && (
        <div>
          <p className="text-sm text-slate-600">
            Search people who have already signed in to StatTool. They get an in-app notification; no email is sent.
          </p>
          <div className="mt-3 flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 3 letters of a name or email" />
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
              <option value="OWNER">Owner</option>
            </Select>
          </div>
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {results.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{u.name ?? "Unnamed user"}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <Button size="sm" disabled={pending} onClick={() => run(async () => {
                    const r = await addMember(projectId, u.id, role);
                    if (r.ok) { setQ(""); setResults([]); }
                    return r;
                  }, "Member added.")}>Add as {role.toLowerCase()}</Button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 3 && results.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">No matching StatTool users. They need to log in once before they can be added.</p>
          )}
        </div>
      )}

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
            {m.picture ? <img src={m.picture} alt="" className="h-8 w-8 rounded-full" /> : <div className="h-8 w-8 rounded-full bg-slate-200" />}
            <div className="flex-1">
              <p className="text-sm font-medium">{m.name ?? m.email}{m.userId === meId && <span className="text-slate-400"> (you)</span>}</p>
              <p className="text-xs text-slate-500">{m.email}</p>
            </div>
            {isOwner ? (
              <>
                <Select value={m.role} disabled={pending} onChange={(e) => run(() => updateMemberRole(projectId, m.userId, e.target.value as Role), "Role updated.")}>
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="OWNER">Owner</option>
                </Select>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeMember(projectId, m.userId), "Member removed.")}>Remove</Button>
              </>
            ) : (
              <Badge>{m.role.toLowerCase()}</Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
