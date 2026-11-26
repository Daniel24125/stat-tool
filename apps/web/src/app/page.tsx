import { redirect } from "next/navigation";
import { BarChart3, FlaskConical, GitBranch, ShieldCheck } from "lucide-react";
import { auth0 } from "@/lib/auth0";
import { ButtonLink } from "@/components/ui";

const features = [
  { icon: BarChart3, title: "Automatic test selection", text: "Checks normality, variance and design, then picks the right test and explains why." },
  { icon: GitBranch, title: "Custom pipelines", text: "Outlier detection, significance testing and multivariate analysis as steps you choose." },
  { icon: FlaskConical, title: "Design of experiments", text: "Screening and response-surface designs with a diagnostic verdict on whether to trust the model." },
  { icon: ShieldCheck, title: "Shared projects", text: "Invite colleagues as owners, editors or viewers. Every result is reproducible and citable." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  const session = await auth0.getSession();
  if (session) redirect("/dashboard");
  const { auth_error } = await searchParams;

  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      {auth_error && (
        <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Login failed ({auth_error}). Please try again; if it keeps happening, the server logs have the details.
        </div>
      )}
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">StatTool</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-slate-900">
        Statistical analysis that chooses the right method and tells you when not to trust the result.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Upload tabular data and get profiling, outlier handling, ANOVA with post-hoc tests, PCA/PLS and
        design-of-experiments analysis, with a methods paragraph ready for your paper.
      </p>
      <div className="mt-8 flex gap-3">
        <ButtonLink href="/auth/login" size="lg">Log in</ButtonLink>
        <ButtonLink href="/auth/login?screen_hint=signup" size="lg" variant="secondary">Sign up</ButtonLink>
      </div>
      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
            <Icon className="h-5 w-5 text-brand-600" />
            <p className="mt-3 font-medium">{title}</p>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
