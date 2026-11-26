import { Badge } from "@/components/ui";

export const typeLabel = { OUTLIERS: "Outliers", COMPARE: "Compare groups", REGRESSION: "Regression", CORRELATION: "Correlation", PCA: "PCA", PLS: "PLS", CLUSTER: "Clustering" } as const;

const tone = { QUEUED: "slate", RUNNING: "amber", DONE: "green", FAILED: "red" } as const;

export function RunStatusBadge({ status }: { status: keyof typeof tone }) {
  return <Badge tone={tone[status]}>{status === "RUNNING" ? "running…" : status.toLowerCase()}</Badge>;
}
