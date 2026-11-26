import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Card } from "@/components/ui";
import { cn, fmt } from "@/lib/utils";

export type Verdict = {
  level: "green" | "amber" | "red";
  text: string;
  checks: { check: string; value: number | null; ok: boolean; warn: boolean; note: string }[];
};

const STYLE = {
  green: { box: "border-emerald-200 bg-emerald-50", icon: ShieldCheck, color: "text-emerald-700", title: "Trust: good" },
  amber: { box: "border-amber-200 bg-amber-50", icon: ShieldQuestion, color: "text-amber-700", title: "Trust: use with caution" },
  red: { box: "border-red-200 bg-red-50", icon: ShieldAlert, color: "text-red-700", title: "Trust: do not rely on this" },
};

export function TrustVerdict({ v }: { v: Verdict }) {
  const s = STYLE[v.level];
  const Icon = s.icon;
  return (
    <Card className={cn("overflow-hidden", s.box)}>
      <div className="flex items-start gap-3 px-5 py-4">
        <Icon className={cn("mt-0.5 h-6 w-6 shrink-0", s.color)} />
        <div>
          <p className={cn("font-semibold", s.color)}>{s.title}</p>
          <p className="text-sm text-slate-700">{v.text}</p>
        </div>
      </div>
      <ul className="divide-y divide-white/60 border-t border-white/60 bg-white/50">
        {v.checks.map((c) => (
          <li key={c.check} className="flex items-start gap-3 px-5 py-2 text-sm">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", c.ok ? "bg-emerald-500" : c.warn ? "bg-amber-500" : "bg-red-500")} />
            <div className="flex-1">
              <span className="font-medium">{c.check}</span>: {fmt(c.value, 3)}
              <p className="text-xs text-slate-500">{c.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
