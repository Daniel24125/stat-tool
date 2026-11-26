"""Group comparisons with automatic test selection.

Decision rules (each step is recorded in the trail shown to the user):

One factor, independent groups
  2 groups:  normal residuals (or every group n >= 30) -> Student t (equal variances) / Welch t
             otherwise -> Mann-Whitney U
  3+ groups: normal -> one-way ANOVA + Tukey HSD (equal variances) / Welch ANOVA + Games-Howell
             otherwise -> Kruskal-Wallis + Dunn (Holm)
One factor, repeated measures (subject column)
  2 levels:  normal differences -> paired t, otherwise Wilcoxon signed-rank
  3+ levels: normal -> RM-ANOVA (Greenhouse-Geisser if sphericity fails) + paired t (Holm)
             otherwise -> Friedman + Wilcoxon (Holm)
Two or three factors, independent
  Factorial ANOVA, Type II SS if balanced, Type III (sum-to-zero contrasts) otherwise.
  Heteroscedastic -> HC3-robust ANOVA and Games-Howell post hoc.
  Non-normal residuals -> tries a Box-Cox transform; uses it only if it fixes normality.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any

import numpy as np
import pandas as pd
import pingouin as pg
import scikit_posthocs as sp
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.multicomp import pairwise_tukeyhsd

from .common import ALPHA, AnalysisError, Trail, clean, describe_groups, normal_test, prepare, safe_names

CLT_N = 30


def _fmt_p(p: float | None) -> str:
    if p is None or np.isnan(p):
        return "p = n/a"
    return "p < 0.001" if p < 0.001 else f"p = {p:.3f}"


def _levene(groups: list[np.ndarray]) -> dict[str, Any]:
    if len(groups) < 2 or any(len(g) < 2 for g in groups):
        return {"test": "Brown-Forsythe (Levene, median)", "p": None, "equal": None}
    stat, p = stats.levene(*groups, center="median")
    return {"test": "Brown-Forsythe (Levene, median)", "statistic": stat, "p": p, "equal": bool(p > ALPHA)}


def _pairs_table(rows: list[dict]) -> list[dict]:
    for r in rows:
        r["significant"] = r.get("p_adj") is not None and r["p_adj"] < ALPHA
    return rows


# ---------------------------------------------------------------- one factor

def _one_factor_independent(data: pd.DataFrame, y: str, f: str, trail: Trail, assumptions: dict, out: dict) -> None:
    levels = sorted(data[f].unique())
    groups = [data.loc[data[f] == lv, y].to_numpy(float) for lv in levels]
    min_n = min(len(g) for g in groups)
    # Normality is checked within each group: pooling residuals from groups with
    # different variances produces heavy tails even when every group is normal.
    per_group = {str(lv): normal_test(g) for lv, g in zip(levels, groups)}
    tested = [v for v in per_group.values() if v["normal"] is not None]
    worst = min(tested, key=lambda v: v["p"]) if tested else {"test": None, "p": None, "normal": None}
    rn = {"test": worst["test"], "p": worst["p"], "normal": all(v["normal"] for v in tested) if tested else None, "per_group": per_group}
    lev = _levene(groups)
    assumptions["normality_within_groups"] = rn
    assumptions["homogeneity"] = lev

    normal_ok = bool(rn["normal"]) or min_n >= CLT_N
    trail.add(
        "Normality within each group",
        f"{rn['test']}, smallest {_fmt_p(rn.get('p'))}" if rn["test"] else "not testable",
        "Parametric test is appropriate." if rn["normal"] else (
            f"Non-normal, but every group has n ≥ {CLT_N}, so the central limit theorem makes a parametric test acceptable."
            if min_n >= CLT_N else "Non-normal with small groups: a rank-based test is used."),
        bool(rn["normal"]),
    )
    if normal_ok:
        trail.add("Equal variances", f"{lev['test']}, {_fmt_p(lev.get('p'))}",
                  "Standard test assuming equal variances." if lev["equal"] else "Variances differ: Welch's correction is used.",
                  lev["equal"])

    k = len(levels)
    if k == 2:
        a, b = groups
        if normal_ok:
            res = stats.ttest_ind(a, b, equal_var=bool(lev["equal"]))
            name = "Student's t-test" if lev["equal"] else "Welch's t-test"
            ci = res.confidence_interval()
            g = pg.compute_effsize(a, b, eftype="hedges")
            df_ = res.df
            out["test"] = {"name": name, "family": "parametric"}
            out["table"] = [{"term": f, "stat_name": "t", "statistic": res.statistic, "df1": df_, "df2": None, "p": res.pvalue,
                             "effect_name": "Hedges' g", "effect_size": g}]
            out["posthoc"] = [{"term": f, "method": "—", "comparisons": _pairs_table([{
                "a": str(levels[0]), "b": str(levels[1]), "diff": a.mean() - b.mean(), "ci_low": ci.low, "ci_high": ci.high, "p_adj": res.pvalue}])}]
            out["summary"] = f"{name}: {y} differed between {levels[0]} and {levels[1]}" if res.pvalue < ALPHA else f"{name}: no significant difference in {y} between {levels[0]} and {levels[1]}"
            out["summary"] += f", t({df_:.1f}) = {res.statistic:.2f}, {_fmt_p(res.pvalue)}, g = {g:.2f}."
        else:
            res = stats.mannwhitneyu(a, b, alternative="two-sided")
            r = 1 - 2 * res.statistic / (len(a) * len(b))
            out["test"] = {"name": "Mann-Whitney U test", "family": "nonparametric"}
            out["table"] = [{"term": f, "stat_name": "U", "statistic": res.statistic, "df1": None, "df2": None, "p": res.pvalue,
                             "effect_name": "rank-biserial r", "effect_size": r}]
            out["posthoc"] = []
            out["summary"] = (f"Mann-Whitney U test: U = {res.statistic:.1f}, {_fmt_p(res.pvalue)}, r = {r:.2f}; medians "
                              f"{np.median(a):.3g} ({levels[0]}) vs {np.median(b):.3g} ({levels[1]}).")
        return

    n = len(data)
    if normal_ok and lev["equal"]:
        aov = pg.anova(data=data, dv=y, between=f, detailed=True)
        F, p = aov.loc[0, "F"], aov.loc[0, "p_unc"] if "p_unc" in aov else aov.loc[0, "p-unc"]
        df1, df2 = aov.loc[0, "DF"], aov.loc[1, "DF"]
        ss_b, ss_w, ms_w = aov.loc[0, "SS"], aov.loc[1, "SS"], aov.loc[1, "MS"]
        eta2 = ss_b / (ss_b + ss_w)
        omega2 = (ss_b - df1 * ms_w) / (ss_b + ss_w + ms_w)
        tk = pairwise_tukeyhsd(data[y].to_numpy(float), data[f].to_numpy(str), alpha=ALPHA)
        # Tukey's meandiff is group2 − group1
        comps = [{"a": r[0], "b": r[1], "diff": float(r[2]), "diff_label": f"{r[1]} − {r[0]}", "p_adj": float(r[3]), "ci_low": float(r[4]), "ci_high": float(r[5])}
                 for r in tk.summary().data[1:]]
        out["test"] = {"name": "One-way ANOVA", "family": "parametric"}
        out["table"] = [{"term": f, "stat_name": "F", "statistic": F, "df1": df1, "df2": df2, "p": p,
                         "effect_name": "η² (ω²)", "effect_size": eta2, "effect_size_2": omega2}]
        out["posthoc"] = [{"term": f, "method": "Tukey HSD", "comparisons": _pairs_table(comps)}]
        out["summary"] = f"One-way ANOVA: F({df1:.0f}, {df2:.0f}) = {F:.2f}, {_fmt_p(p)}, η² = {eta2:.2f}."
    elif normal_ok:
        w = pg.welch_anova(data=data, dv=y, between=f)
        pcol = "p_unc" if "p_unc" in w else "p-unc"
        F, p, df1, df2 = w.loc[0, "F"], w.loc[0, pcol], w.loc[0, "ddof1"], w.loc[0, "ddof2"]
        gh = pg.pairwise_gameshowell(data=data, dv=y, between=f)
        comps = [{"a": r["A"], "b": r["B"], "diff": r["diff"], "p_adj": r["pval"], "ci_low": None, "ci_high": None, "diff_label": f"{r['A']} − {r['B']}"}
                 for _, r in gh.iterrows()]
        out["test"] = {"name": "Welch's ANOVA", "family": "parametric"}
        out["table"] = [{"term": f, "stat_name": "F", "statistic": F, "df1": df1, "df2": df2, "p": p,
                         "effect_name": "η²", "effect_size": w.loc[0, "np2"]}]
        out["posthoc"] = [{"term": f, "method": "Games-Howell", "comparisons": _pairs_table(comps)}]
        out["summary"] = f"Welch's ANOVA: F({df1:.0f}, {df2:.1f}) = {F:.2f}, {_fmt_p(p)}."
    else:
        H, p = stats.kruskal(*groups)
        eps2 = H * (n + 1) / (n**2 - 1)
        dunn = sp.posthoc_dunn(data, val_col=y, group_col=f, p_adjust="holm")
        comps = [{"a": str(a), "b": str(b), "diff": float(np.median(groups[levels.index(a)]) - np.median(groups[levels.index(b)])),
                  "diff_label": f"median {a} − {b}", "p_adj": float(dunn.loc[a, b]), "ci_low": None, "ci_high": None}
                 for a, b in combinations(levels, 2)]
        out["test"] = {"name": "Kruskal-Wallis H test", "family": "nonparametric"}
        out["table"] = [{"term": f, "stat_name": "H", "statistic": H, "df1": len(levels) - 1, "df2": None, "p": p,
                         "effect_name": "ε²", "effect_size": eps2}]
        out["posthoc"] = [{"term": f, "method": "Dunn's test (Holm)", "comparisons": _pairs_table(comps)}]
        out["summary"] = f"Kruskal-Wallis: H({len(levels) - 1}) = {H:.2f}, {_fmt_p(p)}, ε² = {eps2:.2f}."

    trail.add("Number of groups", str(k), f"{out['test']['name']} with {out['posthoc'][0]['method']} for pairwise comparisons.")


def _one_factor_repeated(data: pd.DataFrame, y: str, f: str, subject: str, trail: Trail, assumptions: dict, out: dict, warnings: list) -> None:
    wide = data.pivot_table(index=subject, columns=f, values=y, aggfunc="mean")
    complete = wide.dropna()
    if len(complete) < len(wide):
        warnings.append(f"{len(wide) - len(complete)} subject(s) without a value at every level were dropped.")
    if len(complete) < 3:
        raise AnalysisError("Need at least 3 subjects measured at every level.")
    levels = list(complete.columns)
    long = complete.reset_index().melt(id_vars=subject, var_name=f, value_name=y)
    resid = (complete.to_numpy() - complete.mean(axis=1).to_numpy()[:, None] - complete.mean(axis=0).to_numpy()[None, :] + complete.to_numpy().mean())
    trail.add("Design", f"Repeated measures: {len(complete)} subjects × {len(levels)} levels", "Within-subject tests account for subject differences.")

    if len(levels) == 2:
        a, b = complete[levels[0]].to_numpy(), complete[levels[1]].to_numpy()
        dn = normal_test(a - b)
        assumptions["difference_normality"] = dn
        trail.add("Normality of paired differences", f"{dn['test']}, {_fmt_p(dn.get('p'))}",
                  "Paired t-test." if dn["normal"] else "Wilcoxon signed-rank test.", dn["normal"])
        if dn["normal"]:
            res = stats.ttest_rel(a, b)
            ci = res.confidence_interval()
            dz = (a - b).mean() / (a - b).std(ddof=1)
            out["test"] = {"name": "Paired t-test", "family": "parametric"}
            out["table"] = [{"term": f, "stat_name": "t", "statistic": res.statistic, "df1": res.df, "df2": None, "p": res.pvalue, "effect_name": "Cohen's dz", "effect_size": dz}]
            out["posthoc"] = [{"term": f, "method": "—", "comparisons": _pairs_table([{"a": str(levels[0]), "b": str(levels[1]), "diff": (a - b).mean(), "ci_low": ci.low, "ci_high": ci.high, "p_adj": res.pvalue}])}]
            out["summary"] = f"Paired t-test: t({res.df:.0f}) = {res.statistic:.2f}, {_fmt_p(res.pvalue)}, dz = {dz:.2f}."
        else:
            res = stats.wilcoxon(a, b)
            out["test"] = {"name": "Wilcoxon signed-rank test", "family": "nonparametric"}
            out["table"] = [{"term": f, "stat_name": "W", "statistic": res.statistic, "df1": None, "df2": None, "p": res.pvalue, "effect_name": None, "effect_size": None}]
            out["posthoc"] = []
            out["summary"] = f"Wilcoxon signed-rank: W = {res.statistic:.1f}, {_fmt_p(res.pvalue)}."
        return

    rn = normal_test(resid.ravel())
    assumptions["residual_normality"] = rn
    trail.add("Normality of residuals", f"{rn['test']}, {_fmt_p(rn.get('p'))}",
              "Repeated-measures ANOVA." if rn["normal"] else "Friedman test (rank-based).", rn["normal"])
    if rn["normal"]:
        aov = pg.rm_anova(data=long, dv=y, within=f, subject=subject, correction=True, detailed=True)
        row = aov.iloc[0]
        pcol = "p_unc" if "p_unc" in aov else "p-unc"
        spher = bool(row.get("sphericity", True))
        p = row[pcol]
        p_gg = row.get("p_GG_corr", row.get("p-GG-corr"))
        if not spher and p_gg is not None:
            trail.add("Sphericity (Mauchly)", "violated", "Greenhouse-Geisser corrected p-value is reported.", False)
            p = p_gg
        else:
            trail.add("Sphericity (Mauchly)", "not violated", "Uncorrected p-value is valid.", True)
        post = pg.pairwise_tests(data=long, dv=y, within=f, subject=subject, padjust="holm")
        pc = "p_corr" if "p_corr" in post else "p-corr"
        comps = [{"a": str(r["A"]), "b": str(r["B"]), "diff": None, "p_adj": r[pc], "ci_low": None, "ci_high": None} for _, r in post.iterrows()]
        out["test"] = {"name": "Repeated-measures ANOVA", "family": "parametric"}
        out["table"] = [{"term": f, "stat_name": "F", "statistic": row["F"], "df1": row["DF"], "df2": aov.iloc[1]["DF"] if len(aov) > 1 else None,
                         "p": p, "effect_name": "η²G", "effect_size": row.get("ng2")}]
        out["posthoc"] = [{"term": f, "method": "Paired t-tests (Holm)", "comparisons": _pairs_table(comps)}]
        out["summary"] = f"Repeated-measures ANOVA: F = {row['F']:.2f}, {_fmt_p(p)}."
    else:
        fr = pg.friedman(data=long, dv=y, within=f, subject=subject)
        pcol = "p_unc" if "p_unc" in fr else "p-unc"
        post = pg.pairwise_tests(data=long, dv=y, within=f, subject=subject, padjust="holm", parametric=False)
        pc = "p_corr" if "p_corr" in post else "p-corr"
        comps = [{"a": str(r["A"]), "b": str(r["B"]), "diff": None, "p_adj": r[pc], "ci_low": None, "ci_high": None} for _, r in post.iterrows()]
        out["test"] = {"name": "Friedman test", "family": "nonparametric"}
        out["table"] = [{"term": f, "stat_name": "Q", "statistic": fr.iloc[0]["Q"], "df1": fr.iloc[0]["ddof1"], "df2": None, "p": fr.iloc[0][pcol],
                         "effect_name": "Kendall's W", "effect_size": fr.iloc[0]["W"]}]
        out["posthoc"] = [{"term": f, "method": "Wilcoxon signed-rank (Holm)", "comparisons": _pairs_table(comps)}]
        out["summary"] = f"Friedman test: Q = {fr.iloc[0]['Q']:.2f}, {_fmt_p(fr.iloc[0][pcol])}, W = {fr.iloc[0]['W']:.2f}."


# ---------------------------------------------------------------- factorial

def _factorial(data: pd.DataFrame, y: str, factors: list[str], trail: Trail, assumptions: dict, out: dict, warnings: list) -> None:
    names = safe_names([y] + factors)
    d = data.rename(columns=names)
    yv, fv = names[y], [names[f] for f in factors]
    back = {v: k for k, v in names.items()}

    cells = data.groupby(factors, observed=True).size()
    n_possible = int(np.prod([data[f].nunique() for f in factors]))
    empty = n_possible - len(cells)
    balanced = empty == 0 and cells.nunique() == 1
    out["design"] = {"cells": n_possible, "empty_cells": empty, "min_cell_n": int(cells.min()), "max_cell_n": int(cells.max()), "balanced": balanced}

    terms = " * ".join(f"C({v}, Sum)" for v in fv)
    if empty:
        terms = " + ".join(f"C({v}, Sum)" for v in fv)
        warnings.append(f"{empty} factor combination(s) have no data, so interactions cannot be estimated; a main-effects model is used.")
    if cells.min() < 2:
        warnings.append("Some cells have a single observation; there is little information about within-cell variability.")

    typ = 2 if balanced else 3
    trail.add("Balance", "balanced" if balanced else "unbalanced",
              "Type II sums of squares." if balanced else "Type III sums of squares with sum-to-zero contrasts (order-independent for unbalanced data).", balanced)

    def fit(yname: str, frame: pd.DataFrame):
        return smf.ols(f"{yname} ~ {terms}", data=frame).fit()

    model = fit(yv, d)
    rn = normal_test(model.resid.to_numpy())
    cell_groups = [g[y].to_numpy(float) for _, g in data.groupby(factors, observed=True)]
    lev = _levene(cell_groups)
    assumptions["residual_normality"] = rn
    assumptions["homogeneity"] = lev
    trail.add("Normality of residuals", f"{rn['test']}, {_fmt_p(rn.get('p'))}",
              "OK." if rn["normal"] else "Not normal; checking whether a Box-Cox transformation helps.", rn["normal"])

    transform = None
    if not rn["normal"] and cells.min() < CLT_N:
        yy = data[y].to_numpy(float)
        if (yy > 0).all():
            yt, lam = stats.boxcox(yy)
            d2 = d.copy()
            d2[yv] = yt
            m2 = fit(yv, d2)
            rn2 = normal_test(m2.resid.to_numpy())
            if rn2["normal"]:
                model, d, transform = m2, d2, {"name": "Box-Cox", "lambda": lam}
                assumptions["residual_normality_transformed"] = rn2
                trail.add("Box-Cox transform", f"λ = {lam:.2f}, residuals now {_fmt_p(rn2['p'])}", f"Analysis uses the transformed {y}. Means are still shown on the original scale.", True)
                cell_groups = [g[yv].to_numpy(float) for _, g in d.groupby(fv, observed=True)]
                lev = _levene(cell_groups)
                assumptions["homogeneity"] = lev
            else:
                trail.add("Box-Cox transform", f"λ = {lam:.2f} did not fix normality", "Untransformed ANOVA kept; treat p-values near α with caution.", False)
                warnings.append("Residuals are not normal. ANOVA is fairly robust when groups are similar in size, but consider an aligned rank transform ANOVA or a GLM.")
        else:
            warnings.append("Residuals are not normal and the response has zero/negative values (no Box-Cox). Interpret p-values near α with caution.")

    robust = None
    if lev["equal"] is False:
        robust = "hc3"
        trail.add("Equal variances", f"{lev['test']}, {_fmt_p(lev.get('p'))}", "Heteroscedasticity-robust (HC3) ANOVA and Games-Howell post hoc tests.", False)
    else:
        trail.add("Equal variances", f"{lev['test']}, {_fmt_p(lev.get('p'))}", "Standard ANOVA and Tukey HSD.", True)

    table = sm.stats.anova_lm(model, typ=typ, robust=robust)
    ss_res = table.loc["Residual", "sum_sq"]
    df_res = table.loc["Residual", "df"]
    ms_res = ss_res / df_res
    n = len(d)
    rows = []
    for term, r in table.iterrows():
        if term in ("Residual", "Intercept"):
            continue
        label = term
        for v in fv:
            label = label.replace(f"C({v}, Sum)", back[v])
        label = label.replace(":", " × ")
        ss = r["sum_sq"]
        pe2 = ss / (ss + ss_res)
        po2 = (ss - r["df"] * ms_res) / (ss + (n - r["df"]) * ms_res)
        rows.append({"term": label, "raw_term": term, "stat_name": "F", "statistic": r["F"], "df1": r["df"], "df2": df_res, "p": r["PR(>F)"],
                     "effect_name": "partial η² (ω²p)", "effect_size": pe2, "effect_size_2": max(po2, 0.0)})
    name = f"{len(factors)}-way ANOVA (Type {'II' if typ == 2 else 'III'}{', HC3' if robust else ''})"
    out["test"] = {"name": name, "family": "parametric", "transform": transform}
    out["table"] = rows
    out["model_fit"] = {"r2": model.rsquared, "adj_r2": model.rsquared_adj, "df_resid": df_res}

    # post hoc: for each significant term, compare its levels (or cell combinations for interactions)
    posthoc = []
    yname = yv
    for r in rows:
        if r["p"] is None or r["p"] >= ALPHA:
            continue
        involved = [f for f in factors if f in r["term"].split(" × ")]
        if len(involved) == 1:
            labels = data[involved[0]].astype(str).to_numpy()
        else:
            labels = data[involved].astype(str).agg(" × ".join, axis=1).to_numpy()
        yvals = d[yname].to_numpy(float)
        if len(np.unique(labels)) < 2:
            continue
        if robust:
            frame = pd.DataFrame({"y": yvals, "g": labels})
            gh = pg.pairwise_gameshowell(data=frame, dv="y", between="g")
            comps = [{"a": rr["A"], "b": rr["B"], "diff": rr["diff"], "diff_label": f"{rr['A']} − {rr['B']}", "p_adj": rr["pval"], "ci_low": None, "ci_high": None} for _, rr in gh.iterrows()]
            method = "Games-Howell"
        else:
            tk = pairwise_tukeyhsd(yvals, labels, alpha=ALPHA)
            comps = [{"a": x[0], "b": x[1], "diff": float(x[2]), "diff_label": f"{x[1]} − {x[0]}", "p_adj": float(x[3]), "ci_low": float(x[4]), "ci_high": float(x[5])} for x in tk.summary().data[1:]]
            method = "Tukey HSD"
        note = "Cell means (simple effects)" if len(involved) > 1 else ("Marginal means; with a significant interaction, interpret main effects with care." if any(len(x["term"].split(" × ")) > 1 and x["p"] < ALPHA and r["term"] in x["term"] for x in rows) else None)
        posthoc.append({"term": r["term"], "method": method + (" on transformed scale" if transform else ""), "note": note, "comparisons": _pairs_table(comps)})
    out["posthoc"] = posthoc

    sig = [r for r in rows if r["p"] is not None and r["p"] < ALPHA]
    if sig:
        parts = [f"{r['term']} (F({r['df1']:.0f}, {r['df2']:.0f}) = {r['statistic']:.2f}, {_fmt_p(r['p'])}, partial η² = {r['effect_size']:.2f})" for r in sig]
        out["summary"] = f"{name}: significant effects of " + "; ".join(parts) + "."
    else:
        out["summary"] = f"{name}: no significant effects at α = {ALPHA}."

    if len(factors) >= 2:
        f1, f2 = factors[0], factors[1]
        means = data.groupby([f1, f2], observed=True)[y].agg(["mean", "sem"]).reset_index()
        out["interaction_plot"] = {"x": f1, "trace": f2, "points": [{"x": str(r[f1]), "trace": str(r[f2]), "mean": r["mean"], "se": r["sem"]} for _, r in means.iterrows()]}

    out["residuals"] = {"fitted": model.fittedvalues.tolist(), "resid": model.resid.tolist(),
                        "qq_theoretical": stats.norm.ppf((np.arange(1, n + 1) - 0.5) / n).tolist(), "qq_sample": np.sort(stats.zscore(model.resid)).tolist()}


# ---------------------------------------------------------------- entry point

def compare(df: pd.DataFrame, response: str, factors: list[str], subject: str | None = None, exclude_rows: list[int] | None = None) -> dict[str, Any]:
    if not response:
        raise AnalysisError("Choose a numeric response.")
    if not 1 <= len(factors) <= 3:
        raise AnalysisError("Choose one, two or three factors.")
    if response in factors or (subject and (subject in factors or subject == response)):
        raise AnalysisError("Response, factors and subject must be different columns.")
    if subject and len(factors) > 1:
        raise AnalysisError("Repeated measures with several factors: use the mixed model in the Regression tab.")

    cat = factors + ([subject] if subject else [])
    data, info = prepare(df, [response], cat, exclude_rows)
    for f in factors:
        k = data[f].nunique()
        if k < 2:
            raise AnalysisError(f"'{f}' needs at least two levels with data.")
        if k > 30:
            raise AnalysisError(f"'{f}' has {k} levels; is it really a factor?")
    small = data.groupby(factors, observed=True).size()
    if (small < 2).all():
        raise AnalysisError("Every group has fewer than 2 observations.")

    trail = Trail()
    assumptions: dict[str, Any] = {}
    warnings: list[str] = []
    out: dict[str, Any] = {"type": "compare", "response": response, "factors": factors, "subject": subject, "data_info": info}

    if len(factors) == 1 and subject:
        _one_factor_repeated(data, response, factors[0], subject, trail, assumptions, out, warnings)
    elif len(factors) == 1:
        if (small < 2).any():
            warnings.append("Groups with a single observation were kept but contribute no variance information.")
        _one_factor_independent(data, response, factors[0], trail, assumptions, out)
    else:
        _factorial(data, response, factors, trail, assumptions, out, warnings)

    if info["n_excluded_outliers"]:
        warnings.append(f"{info['n_excluded_outliers']} row(s) were excluded as outliers before this analysis.")
    if min(small) < 3:
        warnings.append("Some groups have fewer than 3 observations; power is very low and assumption checks are unreliable.")

    out.update(
        {
            "trail": trail.steps,
            "assumptions": assumptions,
            "warnings": warnings,
            "groups": describe_groups(data, response, factors),
            "plot": {"label": data[factors].astype(str).agg(" × ".join, axis=1).tolist(), "y": data[response].tolist(), "rows": [int(i) for i in data.index]},
        }
    )
    return clean(out)
