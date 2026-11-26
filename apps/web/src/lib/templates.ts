/**
 * Pipeline templates are dataset-independent: steps refer to roles
 * (responses, factors, subject) instead of column names. Applying a template
 * to a dataset binds the roles to columns and produces a normal pipeline.
 * Safe to import from client components (no server dependencies).
 */

export type TemplateStepType = "OUTLIERS" | "COMPARE" | "REGRESSION" | "CORRELATION" | "PCA" | "PLS" | "CLUSTER";
export type TemplateStep = { id: string; type: TemplateStepType; label?: string; apply_exclusions?: boolean };
export type Roles = { responses: string[]; factors: string[]; subject: string | null };

export type TemplateDef = { id: string; name: string; description: string; steps: TemplateStep[]; builtIn?: boolean };

export const STEP_INFO: Record<TemplateStepType, { label: string; uses: string; minResponses: number }> = {
  OUTLIERS: { label: "Outlier detection", uses: "responses, judged within the first factor", minResponses: 1 },
  COMPARE: { label: "Significance", uses: "each response against the factors (and subject, if any)", minResponses: 1 },
  REGRESSION: { label: "Regression", uses: "each response on the factors", minResponses: 1 },
  CORRELATION: { label: "Correlation", uses: "all responses", minResponses: 2 },
  PCA: { label: "PCA", uses: "all responses, coloured by the first factor", minResponses: 2 },
  PLS: { label: "PLS-DA", uses: "responses as predictors of the first factor", minResponses: 2 },
  CLUSTER: { label: "Clustering", uses: "all responses, compared with the first factor", minResponses: 1 },
};

export const BUILT_IN_TEMPLATES: TemplateDef[] = [
  {
    id: "builtin:standard",
    name: "Standard assessment",
    description: "Remove outliers, test every response for group differences, then look at correlations and the multivariate structure.",
    builtIn: true,
    steps: [
      { id: "s1", type: "OUTLIERS", label: "Remove outliers", apply_exclusions: true },
      { id: "s2", type: "COMPARE", label: "Significance" },
      { id: "s3", type: "CORRELATION", label: "Correlations" },
      { id: "s4", type: "PCA", label: "Multivariate overview" },
    ],
  },
  {
    id: "builtin:screening",
    name: "Significance screening",
    description: "Outlier removal followed by a group comparison for each response. The quickest route to a results table.",
    builtIn: true,
    steps: [
      { id: "s1", type: "OUTLIERS", label: "Remove outliers", apply_exclusions: true },
      { id: "s2", type: "COMPARE", label: "Significance" },
    ],
  },
  {
    id: "builtin:multivariate",
    name: "Multivariate exploration",
    description: "PCA, clustering and PLS-DA to see whether the groups separate when all responses are considered together.",
    builtIn: true,
    steps: [
      { id: "s1", type: "PCA", label: "PCA" },
      { id: "s2", type: "CLUSTER", label: "Clustering" },
      { id: "s3", type: "PLS", label: "PLS-DA" },
    ],
  },
];

type BoundStep = { id: string; type: TemplateStepType; label?: string; params: Record<string, unknown>; apply_exclusions?: boolean };

/** Turn a template into concrete pipeline steps for the chosen columns. Steps whose roles can't be filled are skipped. */
export function bindTemplate(steps: TemplateStep[], roles: Roles): { steps: BoundStep[]; skipped: string[] } {
  const { responses, factors, subject } = roles;
  const f1 = factors[0] ?? null;
  const out: BoundStep[] = [];
  const skipped: string[] = [];
  for (const s of steps) {
    const base = { id: s.id, type: s.type, label: s.label };
    const need = STEP_INFO[s.type].minResponses;
    const needsFactor = ["COMPARE", "REGRESSION", "PLS"].includes(s.type);
    if (responses.length < need || (needsFactor && !f1)) {
      skipped.push(`${s.label || STEP_INFO[s.type].label} (needs ${needsFactor && !f1 ? "a factor" : `${need}+ responses`})`);
      continue;
    }
    switch (s.type) {
      case "OUTLIERS": out.push({ ...base, params: { columns: responses, group_by: f1, method: "auto" }, apply_exclusions: s.apply_exclusions ?? true }); break;
      case "COMPARE": out.push({ ...base, params: { responses, factors: factors.slice(0, 3), subject: factors.length === 1 ? subject : null } }); break;
      case "REGRESSION":
        for (const r of responses) out.push({ ...base, id: `${s.id}-${r}`, label: `${s.label || "Regression"} (${r})`, params: { response: r, predictors: factors, categorical: factors, family: "auto", random_effect: subject } });
        break;
      case "CORRELATION": out.push({ ...base, params: { columns: responses, method: "auto" } }); break;
      case "PCA": out.push({ ...base, params: { columns: responses, scaling: "auto", color_by: f1 } }); break;
      case "PLS": out.push({ ...base, params: { predictors: responses, responses: [], class_column: f1 } }); break;
      case "CLUSTER": out.push({ ...base, params: { columns: responses, method: "auto", compare_with: f1 } }); break;
    }
  }
  return { steps: out, skipped };
}
