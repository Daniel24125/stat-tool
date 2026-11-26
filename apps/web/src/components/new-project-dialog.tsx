"use client";

import { Check, FileSpreadsheet, Loader2, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createProjectWithSetup, previewDataset } from "@/app/actions";
import { Chips } from "@/components/analysis-form";
import { Badge, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { STEP_INFO, bindTemplate, type TemplateDef } from "@/lib/templates";
import type { Profile } from "@/lib/types";
import { cn, maskEmail } from "@/lib/utils";

type Role = "OWNER" | "EDITOR" | "VIEWER";
type Person = { id: string; name: string | null; email: string; picture: string | null; role: Role };
const SECTIONS = ["Project", "Data", "Analysis", "People"] as const;

export function NewProjectDialog({ templates }: { templates: TemplateDef[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reading, setReading] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [responses, setResponses] = useState<string[]>([]);
  const [factors, setFactors] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Omit<Person, "role">[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();

  function reset() {
    setStep(0); setName(""); setDescription(""); setFile(null); setProfile(null); setTemplateId(null);
    setResponses([]); setFactors([]); setSubject(""); setPeople([]); setQ(""); setFound([]);
  }
  const open = () => { reset(); dialog.current?.showModal(); };
  const close = () => dialog.current?.close();

  async function chooseFile(f: File | null) {
    setFile(f); setProfile(null); setTemplateId(null);
    if (!f) return;
    setReading(true);
    const fd = new FormData();
    fd.append("file", f);
    const r = await previewDataset(fd);
    setReading(false);
    if (!r.ok) { toast.error(r.error); setFile(null); return; }
    setProfile(r.profile);
    const ids = new Set(r.profile.columns.filter((c) => c.kind === "identifier").map((c) => c.name));
    const fac = r.profile.suggested_roles.factors.filter((c) => !ids.has(c));
    setFactors(fac.slice(0, 2));
    setResponses(r.profile.suggested_roles.responses.filter((c) => !fac.includes(c)));
  }

  useEffect(() => {
    if (q.trim().length < 3) return setFound([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json()).then((d) => setFound(d.users ?? [])).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const numeric = profile?.columns.filter((c) => c.kind === "numeric").map((c) => c.name) ?? [];
  const factorOptions = profile?.columns.filter((c) => ["categorical", "binary"].includes(c.kind) || (c.kind === "numeric" && c.unique <= 10)).map((c) => c.name) ?? [];
  const subjectOptions = profile?.columns.filter((c) => ["identifier", "categorical", "text"].includes(c.kind)).map((c) => c.name) ?? [];
  const template = templates.find((t) => t.id === templateId);
  const preview = template ? bindTemplate(template.steps, { responses, factors, subject: subject || null }) : null;

  function create() {
    if (!name.trim()) { setStep(0); return toast.error("Give the project a name."); }
    const fd = new FormData();
    if (file) fd.append("file", file);
    fd.append("setup", JSON.stringify({
      name, description: description || undefined,
      templateId: profile ? templateId : null,
      roles: profile && templateId ? { responses, factors, subject: subject || null } : null,
      members: people.map((p) => ({ userId: p.id, role: p.role })),
    }));
    start(async () => {
      const r = await createProjectWithSetup(fd);
      if (!r.ok) { toast.error(r.error); return; }
      r.warnings.forEach((w) => toast.warning(w));
      toast.success(template && profile ? "Project created. The analysis is running." : "Project created.");
      close();
      router.push(r.href);
    });
  }

  const done = [name.trim().length > 0, !!profile, !!templateId && !!profile, people.length > 0];

  return (
    <>
      <Button onClick={open}><Plus className="h-4 w-4" /> New project</Button>
      <dialog
        ref={dialog}
        aria-labelledby="np-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(860px,calc(100vw-2rem))] overflow-hidden rounded-[14px] border border-rule bg-white p-0 text-ink shadow-[0_24px_64px_-24px_rgba(19,35,42,.45)] backdrop:bg-ink/40 open:animate-[np-in_180ms_ease-out]"
      >
        <style>{`@keyframes np-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
        <div className="grid h-[min(560px,calc(100dvh-2rem))] grid-rows-[auto_1fr] md:grid-cols-[200px_1fr] md:grid-rows-1">
          <nav aria-label="New project steps" className="border-b border-rule bg-paper px-5 py-6 md:border-b-0 md:border-r">
            <h2 id="np-title" className="font-serif text-2xl">New project</h2>
            <ol className="mt-6 flex gap-4 md:block md:space-y-1">
              {SECTIONS.map((s, i) => (
                <li key={s}>
                  <button type="button" onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}
                    className={cn("flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-sm", step === i ? "bg-white font-medium text-ink ring-1 ring-rule" : "text-slate-500 hover:text-ink")}>
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border text-[11px]", done[i] ? "border-brand-600 bg-brand-600 text-white" : "border-rule")}>
                      {done[i] ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    {s}
                    {i > 0 && <span className="ml-auto hidden text-[11px] text-slate-400 md:inline">optional</span>}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="flex min-h-0 flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="np-name">Project name</Label>
                    <Input id="np-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Enzyme stability, batch 3" maxLength={120} />
                  </div>
                  <div>
                    <Label htmlFor="np-desc">Description (optional)</Label>
                    <Textarea id="np-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the experiment is about, for you and your collaborators." maxLength={500} />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <p className="text-sm text-slate-600">Add the first dataset now, or later from the project page. The columns are read straight away so you can choose an analysis next.</p>
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files[0] ?? null); }}
                    className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-panel)] border-2 border-dashed border-rule bg-paper/60 px-6 py-8 text-center hover:border-brand-500"
                  >
                    {reading ? <Loader2 className="h-6 w-6 animate-spin text-brand-600" /> : <Upload className="h-6 w-6 text-slate-400" />}
                    <span className="text-sm">{reading ? "Reading columns…" : file ? "Choose a different file" : "Drop a CSV, TSV or XLSX file, or click to choose"}</span>
                    <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="sr-only" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
                  </label>
                  {profile && file && (
                    <div className="mt-4 flex items-start gap-3 rounded-[var(--radius-panel)] border border-rule px-4 py-3">
                      <FileSpreadsheet className="mt-0.5 h-5 w-5 text-brand-600" />
                      <div className="flex-1 text-sm">
                        <p className="font-medium">{file.name}</p>
                        <p className="text-slate-500">{profile.n_rows} rows, {profile.n_cols} columns. Detected {factorOptions.length} possible factor(s) and {numeric.length} numeric column(s).</p>
                        {profile.warnings.length > 0 && <p className="mt-1 text-xs text-amber-700">{profile.warnings[0]}</p>}
                      </div>
                      <Button variant="ghost" size="icon" aria-label="Remove file" onClick={() => chooseFile(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                !profile ? (
                  <p className="text-sm text-slate-600">Add a dataset in the previous step to run an analysis as soon as the project is created. You can also set up pipelines later.</p>
                ) : (
                  <div className="space-y-5">
                    <fieldset>
                      <legend className="mb-2 text-xs font-medium text-slate-600">Pipeline template</legend>
                      <div className="space-y-2">
                        <TemplateChoice checked={templateId === null} onSelect={() => setTemplateId(null)} title="No analysis yet" text="Create the project with the dataset only." />
                        {templates.map((t) => (
                          <TemplateChoice key={t.id} checked={templateId === t.id} onSelect={() => setTemplateId(t.id)} title={t.name} text={t.description}
                            flow={t.steps.map((s) => s.label || STEP_INFO[s.type].label)} badge={t.builtIn ? undefined : "yours"} />
                        ))}
                      </div>
                      <a href="/templates" target="_blank" className="mt-2 inline-block text-xs text-brand-700 hover:underline">Manage templates</a>
                    </fieldset>
                    {templateId && (
                      <div className="space-y-3 rounded-[var(--radius-panel)] border border-rule bg-paper/60 p-4">
                        <div><Label>Factors: what you varied (up to 3)</Label><Chips options={factorOptions.filter((c) => !responses.includes(c))} value={factors} onChange={setFactors} max={3} /></div>
                        <div><Label>Responses: what you measured</Label><Chips options={numeric.filter((c) => !factors.includes(c))} value={responses} onChange={setResponses} /></div>
                        {factors.length === 1 && (
                          <div>
                            <Label>Subject or block, for repeated measures (optional)</Label>
                            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
                              <option value="">Independent samples</option>
                              {subjectOptions.filter((c) => !factors.includes(c)).map((c) => <option key={c}>{c}</option>)}
                            </Select>
                          </div>
                        )}
                        {preview && (
                          <p className="text-xs text-slate-500">
                            Will run {preview.steps.length} step(s){preview.skipped.length > 0 && <span className="text-amber-700">; skipping {preview.skipped.join(", ")}</span>}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}

              {step === 3 && (
                <div>
                  <p className="text-sm text-slate-600">Add people who have signed in to StatTool before. They get a notification in the app; no email is sent.</p>
                  <Input className="mt-4" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 3 letters of a name or email" aria-label="Search people" />
                  {found.length > 0 && (
                    <ul className="mt-2 divide-y divide-rule/70 rounded-[var(--radius-panel)] border border-rule">
                      {found.filter((u) => !people.some((p) => p.id === u.id)).map((u) => (
                        <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span>{u.name ?? "Unnamed user"} <span className="text-slate-500">{u.email}</span></span>
                          <Button size="sm" variant="secondary" onClick={() => { setPeople((p) => [...p, { ...u, role: "EDITOR" }]); setQ(""); }}>Add</Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.trim().length >= 3 && found.length === 0 && <p className="mt-2 text-xs text-slate-500">No match. People need to sign in to StatTool once before they can be added.</p>}
                  {people.length > 0 && (
                    <ul className="mt-5 space-y-2">
                      {people.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 text-sm">
                          {p.picture ? <img src={p.picture} alt="" className="h-7 w-7 rounded-full" /> : <span className="h-7 w-7 rounded-full bg-rule" />}
                          <span className="flex-1">{p.name ?? maskEmail(p.email)}</span>
                          <Select aria-label={`Role for ${p.name ?? "member"}`} value={p.role} onChange={(e) => setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...x, role: e.target.value as Role } : x)))} className="h-8">
                            <option value="VIEWER">Viewer</option><option value="EDITOR">Editor</option><option value="OWNER">Owner</option>
                          </Select>
                          <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setPeople((ps) => ps.filter((x) => x.id !== p.id))}><X className="h-4 w-4" /></Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-rule px-6 py-3">
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <div className="ml-auto flex gap-2">
                {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
                {step < SECTIONS.length - 1 && <Button variant="secondary" onClick={() => setStep(step + 1)} disabled={step === 0 && !name.trim()}>Next</Button>}
                <Button onClick={create} disabled={pending || reading || !name.trim()}>{pending ? "Creating…" : template && profile ? "Create and run" : "Create project"}</Button>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

function TemplateChoice({ checked, onSelect, title, text, flow, badge }: { checked: boolean; onSelect: () => void; title: string; text: string; flow?: string[]; badge?: string }) {
  return (
    <label className={cn("flex cursor-pointer gap-3 rounded-[var(--radius-panel)] border px-4 py-3", checked ? "border-brand-600 bg-brand-50/60" : "border-rule hover:border-slate-400")}>
      <input type="radio" name="template" checked={checked} onChange={onSelect} className="mt-1 accent-brand-600" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title} {badge && <Badge className="ml-1">{badge}</Badge>}</p>
        <p className="text-xs text-slate-500">{text}</p>
        {flow && <p className="mt-1 text-xs text-slate-600">{flow.join("  ›  ")}</p>}
      </div>
    </label>
  );
}
