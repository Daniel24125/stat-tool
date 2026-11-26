import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white hover:bg-brand-700",
        secondary: "bg-white text-ink border border-rule hover:border-slate-400",
        ghost: "text-slate-600 hover:bg-ink/5 hover:text-ink",
        danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
      },
      size: { sm: "h-8 px-3", md: "h-9 px-4", lg: "h-11 px-6 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ className, variant, size, ...props }: ComponentProps<"a"> & VariantProps<typeof buttonVariants>) {
  return <a className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-panel)] border border-rule bg-white", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("border-b border-rule/70 px-5 py-3.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

const field = "rounded-[var(--radius-control)] border border-rule bg-white text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, "h-9 w-full px-3 placeholder:text-slate-400", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "w-full px-3 py-2 placeholder:text-slate-400", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(field, "h-9 px-2", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1 block text-xs font-medium text-slate-600", className)} {...props} />;
}

const badgeVariants = cva("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      slate: "bg-ink/[0.06] text-slate-700",
      blue: "bg-brand-50 text-brand-700",
      green: "bg-emerald-50 text-emerald-800",
      amber: "bg-amber-50 text-amber-800",
      red: "bg-red-50 text-red-700",
      violet: "bg-violet-50 text-violet-700",
    },
  },
  defaultVariants: { tone: "slate" },
});

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-dashed border-rule bg-white/60 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}
