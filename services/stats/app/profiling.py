"""Dataset profiling: column types, missingness, descriptives, normality.

The profile drives later automatic choices (outlier method, test selection),
so every judgement here comes with a plain-language reason.
"""

from __future__ import annotations

import math
import re
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

ALPHA = 0.05
_ID_NAME = re.compile(r"(^|[_\s])(id|run|sample|index|row|order)([_\s#]|no|$)", re.IGNORECASE)
PREVIEW_ROWS = 50


def _clean(value: Any) -> Any:
    """Make values JSON-safe (no NaN/inf, no numpy scalars)."""
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        v = float(value)
        return None if math.isnan(v) or math.isinf(v) else v
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    return value


def infer_kind(s: pd.Series) -> tuple[str, str]:
    """Return (kind, reason). kind in numeric|categorical|binary|datetime|identifier|text|empty."""
    non_null = s.dropna()
    n = len(non_null)
    if n == 0:
        return "empty", "All values are missing."
    unique = non_null.nunique()

    if pd.api.types.is_bool_dtype(s) or unique == 2:
        return "binary", "Exactly two distinct values."

    if pd.api.types.is_numeric_dtype(s):
        is_int = bool(np.all(np.mod(non_null.astype(float), 1) == 0))
        if is_int and unique == n and n > 20:
            vals = np.sort(non_null.to_numpy(dtype=float))
            sequential = bool(np.all(np.diff(vals) == 1))
            if sequential or _ID_NAME.search(str(s.name or "")):
                return "identifier", "Unique consecutive integers or an ID-like name; looks like a row ID."
        if is_int and unique <= max(10, int(0.05 * n)) and unique <= 20:
            return "categorical", f"Integer with only {unique} levels; treated as a factor (can be changed)."
        return "numeric", "Numeric values."

    if pd.api.types.is_datetime64_any_dtype(s):
        return "datetime", "Date/time values."

    # object column: try numbers, then dates
    as_num = pd.to_numeric(non_null, errors="coerce")
    if as_num.notna().mean() > 0.95:
        return "numeric", "Text values that parse as numbers (non-numeric entries will be treated as missing)."
    if non_null.astype(str).str.match(r"^\d{4}-\d{2}-\d{2}").mean() > 0.9:
        return "datetime", "ISO-like dates."
    if unique == n and n > 20:
        return "identifier", "Every value is unique; looks like a label or ID."
    if unique <= max(20, int(0.2 * n)):
        return "categorical", f"{unique} distinct levels."
    return "text", "Free text with many distinct values."


def normality(x: np.ndarray) -> dict[str, Any]:
    """Pick a normality test suited to n and report it with the reason."""
    n = len(x)
    if n < 3:
        return {"test": None, "reason": "Fewer than 3 values; normality cannot be tested.", "normal": None}
    if np.ptp(x) == 0:
        return {"test": None, "reason": "Constant values.", "normal": None}
    if n <= 5000:
        stat, p = stats.shapiro(x)
        test, reason = "Shapiro-Wilk", "Shapiro-Wilk is the most powerful general test for n <= 5000."
    else:
        stat, p = stats.normaltest(x)
        test, reason = "D'Agostino-Pearson", "n > 5000, where Shapiro-Wilk p-values are unreliable."
    return {
        "test": test,
        "statistic": _clean(stat),
        "p": _clean(p),
        "normal": bool(p > ALPHA),
        "reason": reason,
    }


def _numeric_profile(s: pd.Series) -> dict[str, Any]:
    x = pd.to_numeric(s, errors="coerce").dropna().to_numpy(dtype=float)
    if len(x) == 0:
        return {}
    q1, med, q3 = np.percentile(x, [25, 50, 75])
    counts, edges = np.histogram(x, bins=min(30, max(5, int(np.sqrt(len(x))))))
    out: dict[str, Any] = {
        "mean": x.mean(),
        "sd": x.std(ddof=1) if len(x) > 1 else None,
        "min": x.min(),
        "q1": q1,
        "median": med,
        "q3": q3,
        "max": x.max(),
        "skewness": stats.skew(x) if len(x) > 2 else None,
        "kurtosis": stats.kurtosis(x) if len(x) > 3 else None,
        "cv": (x.std(ddof=1) / abs(x.mean())) if len(x) > 1 and x.mean() != 0 else None,
        "histogram": {"counts": counts.tolist(), "edges": edges.tolist()},
    }
    out = {k: (_clean(v) if not isinstance(v, dict) else v) for k, v in out.items()}
    out["normality"] = normality(x)
    return out


def _categorical_profile(s: pd.Series) -> dict[str, Any]:
    vc = s.dropna().astype(str).value_counts()
    return {
        "levels": int(len(vc)),
        "top": [{"value": k, "count": int(v)} for k, v in vc.head(20).items()],
        "min_level_count": int(vc.min()) if len(vc) else 0,
        "balanced": bool(len(vc) > 0 and vc.min() == vc.max()),
    }


def profile(df: pd.DataFrame) -> dict[str, Any]:
    columns = []
    warnings: list[str] = []
    n_rows = len(df)

    for name in df.columns:
        s = df[name]
        kind, reason = infer_kind(s)
        missing = int(s.isna().sum())
        col: dict[str, Any] = {
            "name": name,
            "kind": kind,
            "kind_reason": reason,
            "missing": missing,
            "missing_pct": _clean(100 * missing / n_rows),
            "unique": int(s.nunique(dropna=True)),
        }
        if kind == "numeric":
            col["numeric"] = _numeric_profile(s)
        elif kind in ("categorical", "binary"):
            col["categorical"] = _categorical_profile(s)

        if col["missing_pct"] and col["missing_pct"] > 20:
            warnings.append(f"'{name}' is {col['missing_pct']:.0f}% missing.")
        if kind == "categorical" and col["categorical"]["min_level_count"] < 3:
            warnings.append(f"'{name}' has a level with fewer than 3 observations; group tests will be weak.")
        columns.append(col)

    numeric_cols = [c["name"] for c in columns if c["kind"] == "numeric"]
    factor_cols = [c["name"] for c in columns if c["kind"] in ("categorical", "binary")]

    correlation = None
    if 2 <= len(numeric_cols) <= 60:
        num = df[numeric_cols].apply(pd.to_numeric, errors="coerce")
        all_normal = all(
            (next(c for c in columns if c["name"] == n)["numeric"].get("normality", {}).get("normal")) for n in numeric_cols
        )
        method = "pearson" if all_normal else "spearman"
        corr = num.corr(method=method)
        correlation = {
            "method": method,
            "reason": "All numeric columns look normal." if all_normal else "At least one numeric column is non-normal, so a rank correlation is used.",
            "columns": numeric_cols,
            "matrix": [[_clean(v) for v in row] for row in corr.to_numpy()],
        }

    complete_rows = int(df.dropna().shape[0])
    if complete_rows < n_rows:
        warnings.append(f"{n_rows - complete_rows} of {n_rows} rows have at least one missing value.")

    preview = df.head(PREVIEW_ROWS).astype(object).where(df.head(PREVIEW_ROWS).notna(), None)
    return {
        "n_rows": n_rows,
        "n_cols": int(df.shape[1]),
        "complete_rows": complete_rows,
        "columns": columns,
        "suggested_roles": {
            "factors": factor_cols,
            "responses": numeric_cols,
        },
        "correlation": correlation,
        "warnings": warnings,
        "preview": {
            "columns": list(df.columns),
            "rows": [[_clean(v) for v in row] for row in preview.itertuples(index=False)],
        },
    }
