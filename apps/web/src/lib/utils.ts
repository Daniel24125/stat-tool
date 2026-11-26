import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number | null | undefined, digits = 3) {
  if (n === null || n === undefined) return "—";
  if (n !== 0 && (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e6)) return n.toExponential(2);
  return Number(n.toFixed(digits)).toString();
}

export function fmtP(p: number | null | undefined) {
  if (p === null || p === undefined) return "—";
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}

/** d***@gmail.com — shown in member search so full emails aren't exposed. */
export function maskEmail(email: string | null) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
