"""Outlier detection with automatic method selection.

All applicable methods are run so the user can see how much they agree; the
selected method decides the suggested exclusions. Nothing is removed here:
the user confirms exclusions in the app.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.covariance import MinCovDet
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor

from .common import AnalysisError, Trail, clean, normal_test, prepare

METHOD_INFO = {
    "iqr": "Tukey's fences (outside Q1 - 1.5·IQR or Q3 + 1.5·IQR)",
    "mad": "Robust z-score using the median absolute deviation (|modified z| > 3.5; Iglewicz & Hoaglin)",
    "esd": "Generalized ESD test (Rosner), assumes normality, α = 0.05",
    "mcd": "Robust Mahalanobis distance with the Minimum Covariance Determinant (χ² 97.5% cut-off)",
    "iforest": "Isolation Forest (Liu et al.), contamination estimated automatically",
    "lof": "Local Outlier Factor (Breunig et al.), 20 neighbours",
}


# ---------- univariate methods: return (flag mask, score) ----------

def _iqr(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    q1, q3 = np.percentile(x, [25, 75])
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    score = np.where(x < lo, (lo - x) / (iqr or 1), np.where(x > hi, (x - hi) / (iqr or 1), 0.0))
    return (x < lo) | (x > hi), score


def _mad(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    med = np.median(x)
    mad = np.median(np.abs(x - med))
    if mad == 0:
        mad = np.mean(np.abs(x - med)) * 1.2533 or 1.0  # fallback when >50% identical values
        z = (x - med) / mad
    else:
        z = 0.6745 * (x - med) / mad
    return np.abs(z) > 3.5, np.abs(z)


def _esd(x: np.ndarray, alpha: float = 0.05) -> tuple[np.ndarray, np.ndarray]:
    n = len(x)
    max_out = max(1, int(0.1 * n))
    idx = np.arange(n)
    work = x.astype(float).copy()
    keep = np.ones(n, bool)
    removed: list[tuple[int, float, float]] = []
    for i in range(1, max_out + 1):
        vals = work[keep]
        if len(vals) < 3 or vals.std(ddof=1) == 0:
            break
        dev = np.abs(vals - vals.mean()) / vals.std(ddof=1)
        j = int(np.argmax(dev))
        r = dev[j]
        nn = n - i + 1
        p = 1 - alpha / (2 * nn)
        t = stats.t.ppf(p, nn - 2)
        lam = (nn - 1) * t / np.sqrt((nn - 2 + t**2) * nn)
        orig = idx[keep][j]
        removed.append((orig, r, lam))
        keep[orig] = False
    # number of outliers = largest i with R_i > lambda_i
    n_out = 0
    for i, (_, r, lam) in enumerate(removed, start=1):
        if r > lam:
            n_out = i
    mask = np.zeros(n, bool)
    score = np.zeros(n)
    for orig, r, lam in removed:
        score[orig] = r / lam
    for orig, _, _ in removed[:n_out]:
        mask[orig] = True
    return mask, score


# ---------- multivariate methods ----------

def _mcd(X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    Z = (X - np.median(X, axis=0)) / (X.std(axis=0, ddof=1) + 1e-12)
    mcd = MinCovDet(random_state=0).fit(Z)
    d2 = mcd.mahalanobis(Z)
    cut = stats.chi2.ppf(0.975, X.shape[1])
    return d2 > cut, d2 / cut


def _iforest(X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    m = IsolationForest(contamination="auto", random_state=0).fit(X)
    score = -m.score_samples(X)
    return m.predict(X) == -1, score


def _lof(X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    k = min(20, len(X) - 1)
    m = LocalOutlierFactor(n_neighbors=k)
    pred = m.fit_predict(X)
    return pred == -1, -m.negative_outlier_factor_


# ---------- selection ----------

def choose_method(n: int, p: int, all_normal: bool, trail: Trail) -> str:
    if p == 1:
        trail.add("Number of variables", "1", "Univariate methods apply.")
        if all_normal and n >= 15:
            trail.add("Normality", "Normal", "Generalized ESD is the most powerful test for normal data and handles several outliers.", True)
            return "esd"
        reason = "Non-normal" if not all_normal else f"n = {n} is too small for ESD"
        trail.add("Normality / sample size", reason, "MAD robust z-score: does not assume normality and is not distorted by the outliers themselves.", False)
        return "mad"
    trail.add("Number of variables", str(p), "Multivariate methods find points that are unusual in combination, not only per variable.")
    if n >= 5 * p:
        if all_normal:
            trail.add("Approximate normality & n ≥ 5p", "Yes", "Robust Mahalanobis (MCD) is the standard for roughly elliptical data.", True)
            return "mcd"
        if n >= 50:
            trail.add("Normality", "Non-normal, n ≥ 50", "Isolation Forest makes no distributional assumption.", False)
            return "iforest"
        trail.add("Normality", "Non-normal but n < 50", "MCD is still used; Isolation Forest is unstable in small samples. Check the agreement table.", False)
        return "mcd"
    trail.add("Sample size vs variables", f"n = {n} < 5p = {5 * p}", "Too few rows for a covariance estimate; MAD applied per variable instead.", False)
    return "mad"


def detect(df: pd.DataFrame, columns: list[str], group_by: str | None = None, method: str = "auto", exclude_rows: list[int] | None = None) -> dict[str, Any]:
    if not columns:
        raise AnalysisError("Choose at least one numeric column.")
    cat = [group_by] if group_by else []
    data, info = prepare(df, columns, cat, exclude_rows)
    if len(data) < 5:
        raise AnalysisError("At least 5 complete rows are needed.")

    p = len(columns)
    trail = Trail()
    # With groups, judge normality on within-group deviations; otherwise genuine
    # group differences make the pooled data look non-normal.
    centred = data[columns] - data.groupby(group_by, observed=True)[columns].transform("mean") if group_by else data[columns]
    normality = {c: normal_test(centred[c].to_numpy()) for c in columns}
    all_normal = all(v["normal"] for v in normality.values() if v["normal"] is not None)

    if method == "auto":
        method = choose_method(len(data), p, all_normal, trail)
    elif method not in METHOD_INFO:
        raise AnalysisError(f"Unknown method '{method}'.")
    else:
        trail.add("Method", method, "Chosen by the user.")

    if group_by:
        trail.add("Grouping", group_by, "Outliers are judged within each group, so real treatment differences are not flagged.")

    candidates = ["iqr", "mad"] + (["esd"] if p == 1 else []) + (["mcd", "iforest", "lof"] if p > 1 else [])
    if method not in candidates:
        candidates.append(method)

    groups = data.groupby(group_by, observed=True) if group_by else [(None, data)]
    flags = {m: pd.Series(False, index=data.index) for m in candidates}
    scores = {m: pd.Series(0.0, index=data.index) for m in candidates}
    skipped: dict[str, str] = {}

    for _, g in groups:
        X = g[columns].to_numpy(dtype=float)
        for m in candidates:
            try:
                if m in ("iqr", "mad", "esd"):
                    fn = {"iqr": _iqr, "mad": _mad, "esd": _esd}[m]
                    mask = np.zeros(len(g), bool)
                    sc = np.zeros(len(g))
                    for j in range(p):
                        if len(g) < 3:
                            continue
                        mk, s = fn(X[:, j])
                        mask |= mk
                        sc = np.maximum(sc, s)
                else:
                    min_n = {"mcd": max(10, 2 * p + 1), "iforest": 50, "lof": 20}[m]
                    if len(g) < min_n:
                        skipped[m] = f"needs at least {min_n} rows{' per group' if group_by else ''}"
                        continue
                    mask, sc = {"mcd": _mcd, "iforest": _iforest, "lof": _lof}[m](X)
                flags[m].loc[g.index] = mask
                scores[m].loc[g.index] = sc
            except Exception as exc:  # degenerate data (singular covariance etc.)
                skipped[m] = str(exc)

    agree = sum(flags[m].astype(int) for m in candidates if m not in skipped)
    chosen = flags[method]
    flagged_rows = []
    for idx in data.index[chosen | (agree >= 2)]:
        flagged_rows.append(
            {
                "row": int(idx),
                "values": {c: data.at[idx, c] for c in columns},
                "group": data.at[idx, group_by] if group_by else None,
                "flagged_by_selected": bool(chosen.loc[idx]),
                "methods": [m for m in candidates if m not in skipped and flags[m].loc[idx]],
                "score": scores[method].loc[idx],
            }
        )
    flagged_rows.sort(key=lambda r: (-r["flagged_by_selected"], -len(r["methods"]), -(r["score"] or 0)))

    warnings = []
    pct = 100 * chosen.sum() / len(data)
    if pct > 10:
        warnings.append(f"{pct:.0f}% of rows are flagged. That many 'outliers' usually means a skewed or multimodal distribution rather than bad data; consider a transformation or a non-parametric test instead of removal.")
    warnings.append("Only remove outliers with a substantive reason (measurement error, protocol deviation). Report how many were removed and why.")

    return clean(
        {
            "type": "outliers",
            "data_info": info,
            "columns": columns,
            "group_by": group_by,
            "selected_method": method,
            "selected_method_label": METHOD_INFO[method],
            "trail": trail.steps,
            "normality": normality,
            "methods": [
                {"key": m, "label": METHOD_INFO[m], "n_flagged": int(flags[m].sum()) if m not in skipped else None, "skipped": skipped.get(m)}
                for m in candidates
            ],
            "flagged": flagged_rows,
            "suggested_exclusions": [int(i) for i in data.index[chosen]],
            "warnings": warnings,
            "plot": {
                "rows": [int(i) for i in data.index],
                "values": {c: data[c].tolist() for c in columns},
                "group": data[group_by].tolist() if group_by else None,
                "flag": chosen.tolist(),
            },
        }
    )
