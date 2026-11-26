"""Regression: OLS, GLM (binomial / Poisson / negative binomial) and linear mixed models.

Family is chosen from the response when family="auto":
  two distinct values             -> logistic (binomial)
  non-negative integers, ≤ 50 levels -> Poisson, switching to negative binomial if overdispersed
  otherwise                        -> linear (Gaussian)
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.stats.stattools import durbin_watson

from .common import ALPHA, AnalysisError, Trail, clean, normal_test, prepare, safe_names


def _detect_family(y: pd.Series, trail: Trail) -> str:
    vals = y.dropna()
    if vals.nunique() == 2:
        trail.add("Response type", "two distinct values", "Logistic regression (binomial GLM).")
        return "binomial"
    as_num = pd.to_numeric(vals, errors="coerce")
    if as_num.notna().all() and (as_num >= 0).all() and np.all(np.mod(as_num, 1) == 0) and as_num.nunique() <= 50:
        trail.add("Response type", "non-negative integer counts", "Poisson GLM (checked for overdispersion).")
        return "poisson"
    trail.add("Response type", "continuous", "Linear regression (ordinary least squares).")
    return "gaussian"


def _coef_table(params, bse, stat, pvals, ci, back: dict[str, str], stat_name: str, exp: bool = False) -> list[dict]:
    rows = []
    for term in params.index:
        label = term
        for safe, orig in back.items():
            label = label.replace(f"C({safe})", orig).replace(safe, orig)
        label = label.replace("[T.", "[")
        row = {"term": label, "estimate": params[term], "se": bse[term], "stat_name": stat_name, "statistic": stat[term], "p": pvals[term],
               "ci_low": ci.loc[term, 0], "ci_high": ci.loc[term, 1], "significant": bool(pvals[term] < ALPHA)}
        if exp:
            row.update({"exp_estimate": np.exp(params[term]), "exp_ci_low": np.exp(ci.loc[term, 0]), "exp_ci_high": np.exp(ci.loc[term, 1])})
        rows.append(row)
    return rows


def regression(df: pd.DataFrame, response: str, predictors: list[str], categorical: list[str] | None = None, family: str = "auto",
               random_effect: str | None = None, exclude_rows: list[int] | None = None) -> dict[str, Any]:
    if not response or not predictors:
        raise AnalysisError("Choose a response and at least one predictor.")
    if response in predictors:
        raise AnalysisError("The response cannot also be a predictor.")
    categorical = [c for c in (categorical or []) if c in predictors]
    numeric_preds = [p for p in predictors if p not in categorical]

    trail = Trail()
    raw_y = df[response] if response in df else None
    if raw_y is None:
        raise AnalysisError(f"Unknown column: {response}")
    if family == "auto":
        family = _detect_family(raw_y, trail)
    else:
        trail.add("Family", family, "Chosen by the user.")

    cat_cols = categorical + ([random_effect] if random_effect else [])
    num_cols = numeric_preds + ([response] if family != "binomial" else [])
    data, info = prepare(df, num_cols, cat_cols + ([response] if family == "binomial" else []), exclude_rows)
    if family == "binomial":
        levels = sorted(data[response].unique())
        if len(levels) != 2:
            raise AnalysisError("Logistic regression needs a response with exactly two values.")
        data[response] = (data[response] == levels[1]).astype(int)
        trail.add("Outcome coding", f"1 = '{levels[1]}', 0 = '{levels[0]}'", "Coefficients are log-odds of the '1' outcome.")

    n, k = len(data), len(predictors)
    if n < k + 3:
        raise AnalysisError(f"Only {n} complete rows for {k} predictors.")
    names = safe_names([response] + predictors + ([random_effect] if random_effect else []))
    back = {v: k_ for k_, v in names.items()}
    d = data.rename(columns=names)
    rhs = " + ".join(f"C({names[p]})" if p in categorical else names[p] for p in predictors)
    formula = f"{names[response]} ~ {rhs}"

    warnings: list[str] = []
    out: dict[str, Any] = {"type": "regression", "response": response, "predictors": predictors, "categorical": categorical,
                           "random_effect": random_effect, "data_info": info}
    events_per_var = None

    if random_effect:
        if family != "gaussian":
            raise AnalysisError("Mixed models are currently available for continuous responses only.")
        n_groups = d[names[random_effect]].nunique()
        trail.add("Random effect", f"{random_effect} ({n_groups} groups)", "Linear mixed model with a random intercept per group (fitted by ML so AIC is comparable).")
        if n_groups < 5:
            warnings.append(f"Only {n_groups} groups for the random effect; variance components are poorly estimated with fewer than ~5 groups. Consider a fixed effect instead.")
        m = smf.mixedlm(formula, d, groups=d[names[random_effect]]).fit(reml=False)
        fe = m.fe_params.index
        ci = m.conf_int().loc[fe]
        out["coefficients"] = _coef_table(m.fe_params, m.bse[fe], m.tvalues[fe], m.pvalues[fe], ci, back, "z")
        var_g = float(m.cov_re.iloc[0, 0])
        var_e = float(m.scale)
        out["fit"] = {"model": "Linear mixed model", "n": n, "groups": n_groups, "aic": m.aic, "bic": m.bic, "log_likelihood": m.llf,
                      "random_intercept_var": var_g, "residual_var": var_e, "icc": var_g / (var_g + var_e) if var_g + var_e > 0 else None,
                      "converged": bool(m.converged)}
        if not m.converged:
            warnings.append("The mixed model did not converge; results may be unreliable.")
        resid, fitted = m.resid, m.fittedvalues
    elif family == "gaussian":
        m = smf.ols(formula, d).fit()
        rn = normal_test(m.resid.to_numpy())
        bp = het_breuschpagan(m.resid, m.model.exog)
        hetero = bp[1] < ALPHA
        trail.add("Residual normality", f"{rn['test']}, p = {rn['p']:.3f}" if rn["p"] is not None else "n/a",
                  "OK." if rn["normal"] else ("Non-normal, but n is large enough for valid inference." if n >= 50 else "Non-normal residuals with small n: p-values are approximate."), rn["normal"])
        trail.add("Constant variance (Breusch-Pagan)", f"p = {bp[1]:.3f}",
                  "OK; ordinary standard errors." if not hetero else "Heteroscedastic: refitted with HC3 robust standard errors.", not hetero)
        if hetero:
            m = smf.ols(formula, d).fit(cov_type="HC3")
        out["coefficients"] = _coef_table(m.params, m.bse, m.tvalues, m.pvalues, m.conf_int(), back, "t")
        infl = m.get_influence()
        cooks = infl.cooks_distance[0]
        cut = 4 / n
        influential = [{"row": int(idx), "cooks_d": float(c)} for idx, c in zip(data.index, cooks) if c > cut]
        vif = []
        X = m.model.exog
        if X.shape[1] > 2:
            for i, nm in enumerate(m.model.exog_names):
                if nm == "Intercept":
                    continue
                v = variance_inflation_factor(X, i)
                label = nm
                for s, o in back.items():
                    label = label.replace(f"C({s})", o).replace(s, o)
                vif.append({"term": label.replace("[T.", "["), "vif": v})
            if any(v["vif"] > 10 for v in vif if v["vif"] is not None and np.isfinite(v["vif"])):
                warnings.append("VIF > 10: strong multicollinearity; individual coefficients are unstable. Consider PLS or removing a predictor.")
        out["fit"] = {"model": "Linear regression (OLS)" + (" with HC3 SEs" if hetero else ""), "n": n, "r2": m.rsquared, "adj_r2": m.rsquared_adj,
                      "f": m.fvalue, "f_p": m.f_pvalue, "df_model": m.df_model, "df_resid": m.df_resid, "aic": m.aic, "bic": m.bic,
                      "rmse": float(np.sqrt(m.mse_resid)), "durbin_watson": durbin_watson(m.resid)}
        out["diagnostics"] = {"residual_normality": rn, "breusch_pagan_p": bp[1], "vif": vif, "influential": influential, "cooks_cutoff": cut}
        if influential:
            warnings.append(f"{len(influential)} influential point(s) (Cook's D > 4/n). Check whether results hold without them.")
        resid, fitted = m.resid, m.fittedvalues
    else:
        fam = sm.families.Binomial() if family == "binomial" else sm.families.Poisson()
        m = smf.glm(formula, d, family=fam).fit()
        if family == "poisson":
            disp = m.pearson_chi2 / m.df_resid
            if disp > 1.5:
                trail.add("Overdispersion", f"Pearson χ²/df = {disp:.2f}", "Negative binomial GLM instead of Poisson.", False)
                m = smf.glm(formula, d, family=sm.families.NegativeBinomial(alpha=max(disp - 1, 0.01) / max(d[names[response]].mean(), 1e-6))).fit()
                family = "negative binomial"
            else:
                trail.add("Overdispersion", f"Pearson χ²/df = {disp:.2f}", "Poisson is adequate.", True)
        if family == "binomial":
            events = int(min(d[names[response]].sum(), n - d[names[response]].sum()))
            events_per_var = events / max(len(m.params) - 1, 1)
            if events_per_var < 10:
                warnings.append(f"Only {events_per_var:.1f} events per predictor (rule of thumb ≥ 10): estimates may be biased and unstable.")
        out["coefficients"] = _coef_table(m.params, m.bse, m.tvalues, m.pvalues, m.conf_int(), back, "z", exp=True)
        null = smf.glm(f"{names[response]} ~ 1", d, family=m.family).fit()
        out["fit"] = {"model": {"binomial": "Logistic regression", "poisson": "Poisson regression"}.get(family, "Negative binomial regression"),
                      "n": n, "aic": m.aic, "deviance": m.deviance, "null_deviance": m.null_deviance, "df_resid": m.df_resid,
                      "pseudo_r2_mcfadden": 1 - m.llf / null.llf if null.llf else None, "lr_test_p": stats.chi2.sf(2 * (m.llf - null.llf), m.df_model),
                      "exp_label": "Odds ratio" if family == "binomial" else "Rate ratio", "events_per_variable": events_per_var}
        resid, fitted = m.resid_deviance, m.fittedvalues

    out["family"] = family
    out["formula"] = f"{response} ~ " + " + ".join(predictors) + (f" + (1 | {random_effect})" if random_effect else "")
    out["trail"] = trail.steps
    out["warnings"] = warnings + ([f"{info['n_excluded_outliers']} row(s) were excluded as outliers."] if info["n_excluded_outliers"] else [])
    r = np.asarray(resid, float)
    out["residuals"] = {"fitted": np.asarray(fitted, float).tolist(), "resid": r.tolist(),
                        "qq_theoretical": stats.norm.ppf((np.arange(1, len(r) + 1) - 0.5) / len(r)).tolist(),
                        "qq_sample": np.sort((r - r.mean()) / (r.std(ddof=1) or 1)).tolist()}
    sig = [c["term"] for c in out["coefficients"] if c["significant"] and c["term"] != "Intercept"]
    out["summary"] = f"{out['fit']['model']} of {response} (n = {n}). " + (f"Significant predictors: {', '.join(sig)}." if sig else "No predictor was significant at α = 0.05.")
    return clean(out)
