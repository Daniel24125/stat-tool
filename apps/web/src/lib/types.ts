export type ColumnKind = "numeric" | "categorical" | "binary" | "datetime" | "identifier" | "text" | "empty";

export interface Normality {
  test: string | null;
  statistic?: number | null;
  p?: number | null;
  normal: boolean | null;
  reason: string;
}

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  kind_reason: string;
  missing: number;
  missing_pct: number;
  unique: number;
  numeric?: {
    mean: number | null;
    sd: number | null;
    min: number | null;
    q1: number | null;
    median: number | null;
    q3: number | null;
    max: number | null;
    skewness: number | null;
    kurtosis: number | null;
    cv: number | null;
    histogram: { counts: number[]; edges: number[] };
    normality: Normality;
  };
  categorical?: {
    levels: number;
    top: { value: string; count: number }[];
    min_level_count: number;
    balanced: boolean;
  };
}

export interface Profile {
  n_rows: number;
  n_cols: number;
  complete_rows: number;
  columns: ColumnProfile[];
  suggested_roles: { factors: string[]; responses: string[] };
  correlation: { method: string; reason: string; columns: string[]; matrix: (number | null)[][] } | null;
  warnings: string[];
  preview: { columns: string[]; rows: unknown[][] };
}
