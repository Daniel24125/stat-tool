"""Pairwise correlation with automatic Pearson/Spearman choice and Holm correction."""

from __future__ import annotations

from itertools import combinations
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests

from .common import ALPHA, AnalysisError, Trail, clean, normal_test, prepare


def correlation(df: pd.DataFrame, columns: list[str], method: str = "auto", exclude_rows: list[int] | None = None) -> dict[str, Any]:
    if len(columns) < 2:
        raise AnalysisError("Choose at least two numeric columns.")
    data, info = prepare(df, columns, [], exclude_rows)
    if len(data) < 5:
        raise AnalysisError("At least 5 complete rows are needed.")
    trail = Trail()
    normality = {c: normal_test(data[c].to_numpy()) for c in columns}
    if method == "auto":
        all_normal = all(v["normal"] for v in normality.values() if v["normal"] is not None)
        method = "pearson" if all_normal else "spearman"
        trail.add("Normality of variables", "all normal" if all_normal else "at least one non-normal",
                  "Pearson (linear association)." if all_normal else "Spearman rank correlation (monotonic association, robust to non-normality and outliers).", all_normal)

    pairs = []
    for a, b in combinations(columns, 2):
        x, y = data[a].to_numpy(float), data[b].to_numpy(float)
        if method == "pearson":
            res = stats.pearsonr(x, y)
            ci = res.confidence_interval()
            r, p, lo, hi = res.statistic, res.pvalue, ci.low, ci.high
        else:
            r, p = stats.spearmanr(x, y)
            z, se = np.arctanh(np.clip(r, -0.9999, 0.9999)), 1.06 / np.sqrt(len(x) - 3)  # Fieller et al. approximation
            lo, hi = np.tanh(z - 1.96 * se), np.tanh(z + 1.96 * se)
        pairs.append({"a": a, "b": b, "r": r, "p": p, "ci_low": lo, "ci_high": hi})
    if len(pairs) > 1:
        adj = multipletests([pp["p"] for pp in pairs], method="holm")[1]
        trail.add("Multiple testing", f"{len(pairs)} pairs", "Holm-adjusted p-values control the family-wise error rate.")
    else:
        adj = [pairs[0]["p"]]
    for pp, pa in zip(pairs, adj):
        pp["p_adj"] = pa
        pp["significant"] = bool(pa < ALPHA)

    matrix = data[columns].corr(method=method).to_numpy()
    return clean({"type": "correlation", "method": method, "columns": columns, "data_info": info, "trail": trail.steps,
                  "normality": normality, "pairs": pairs, "matrix": matrix, "warnings": []})
