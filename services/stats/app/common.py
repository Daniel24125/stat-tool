"""Helpers shared by the analysis modules."""

from __future__ import annotations

import math
from typing import Any, Iterable

import numpy as np
import pandas as pd
from scipy import stats

ALPHA = 0.05


class AnalysisError(ValueError):
    """A problem with the user's request or data, reported back as a 422."""


def clean(value: Any) -> Any:
    """Recursively convert to JSON-safe Python types (NaN/inf -> None)."""
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, np.ndarray):
        return [clean(v) for v in value.tolist()]
    if isinstance(value, (pd.Series, pd.Index)):
        return [clean(v) for v in value.tolist()]
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        v = float(value)
        return None if math.isnan(v) or math.isinf(v) else v
    if value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def require_columns(df: pd.DataFrame, cols: Iterable[str]) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise AnalysisError(f"Unknown column(s): {', '.join(missing)}")


def prepare(df: pd.DataFrame, numeric: list[str], categorical: list[str], exclude_rows: list[int] | None) -> tuple[pd.DataFrame, dict]:
    """Subset, coerce types, drop excluded and incomplete rows.

    The original 0-based row number is kept in the index so results can refer
    back to rows in the uploaded file.
    """
    require_columns(df, numeric + categorical)
    out = df[numeric + categorical].copy()
    for c in numeric:
        out[c] = pd.to_numeric(out[c], errors="coerce")
    for c in categorical:
        out[c] = out[c].astype("string")
    n_total = len(out)
    excluded = sorted(set(exclude_rows or []) & set(out.index))
    out = out.drop(index=excluded)
    n_after_excl = len(out)
    out = out.dropna()
    info = {
        "n_total": n_total,
        "n_excluded_outliers": len(excluded),
        "n_missing_dropped": n_after_excl - len(out),
        "n_used": len(out),
    }
    return out, info


def normal_test(x: np.ndarray) -> dict[str, Any]:
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    if len(x) < 3 or np.ptp(x) == 0:
        return {"test": None, "p": None, "normal": None}
    if len(x) <= 5000:
        stat, p = stats.shapiro(x)
        name = "Shapiro-Wilk"
    else:
        stat, p = stats.normaltest(x)
        name = "D'Agostino-Pearson"
    return {"test": name, "statistic": float(stat), "p": float(p), "normal": bool(p > ALPHA)}


def describe_groups(df: pd.DataFrame, response: str, group_cols: list[str]) -> list[dict]:
    rows = []
    for key, g in df.groupby(group_cols, observed=True, sort=True):
        y = g[response].to_numpy(dtype=float)
        n = len(y)
        sd = y.std(ddof=1) if n > 1 else np.nan
        se = sd / np.sqrt(n) if n > 1 else np.nan
        half = stats.t.ppf(0.975, n - 1) * se if n > 1 else np.nan
        key = key if isinstance(key, tuple) else (key,)
        rows.append(
            {
                "group": dict(zip(group_cols, [str(k) for k in key])),
                "label": " × ".join(str(k) for k in key),
                "n": n,
                "mean": y.mean(),
                "sd": sd,
                "se": se,
                "ci95": [y.mean() - half, y.mean() + half],
                "median": float(np.median(y)),
                "min": y.min(),
                "max": y.max(),
            }
        )
    return rows


def safe_names(cols: list[str]) -> dict[str, str]:
    """Map user column names to formula-safe identifiers (v0, v1, ...)."""
    return {c: f"v{i}" for i, c in enumerate(cols)}


class Trail:
    """Records each automatic decision so the UI can explain the choice."""

    def __init__(self) -> None:
        self.steps: list[dict[str, Any]] = []

    def add(self, check: str, result: str, consequence: str, ok: bool | None = None) -> None:
        self.steps.append({"check": check, "result": result, "consequence": consequence, "ok": ok})
