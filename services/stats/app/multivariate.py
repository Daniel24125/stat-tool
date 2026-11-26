"""Multivariate analysis: PCA, PLS regression / PLS-DA, and clustering.

Every model reports how far it can be trusted:
  PCA      Bartlett's sphericity and KMO (is there shared structure to summarise?),
           Hotelling's T² and Q-residual limits to flag atypical samples.
  PLS      components chosen by cross-validation (Q²), a permutation test of Q²,
           and an R²–Q² gap check for overfitting.
  Cluster  silhouette width across k and methods; < 0.25 means no real structure.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from scipy.cluster.hierarchy import dendrogram, fcluster, linkage
from sklearn.cluster import KMeans
from sklearn.cross_decomposition import PLSRegression
from sklearn.metrics import adjusted_rand_score, confusion_matrix, silhouette_score
from sklearn.model_selection import KFold, StratifiedKFold

from .common import AnalysisError, Trail, clean, prepare

MAX_COMPONENTS = 10


# ---------------------------------------------------------------- scaling

def scale(X: np.ndarray, method: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = X.mean(axis=0)
    sd = X.std(axis=0, ddof=1)
    sd[sd == 0] = 1.0
    if method == "autoscale":
        s = sd
    elif method == "pareto":
        s = np.sqrt(sd)
    else:
        s = np.ones_like(sd)
    return (X - mean) / s, mean, s


def choose_scaling(X: np.ndarray, columns: list[str], method: str, trail: Trail) -> str:
    if method != "auto":
        trail.add("Scaling", method, "Chosen by the user.")
        return method
    sd = X.std(axis=0, ddof=1)
    ratio = sd.max() / max(sd[sd > 0].min(), 1e-12) if (sd > 0).any() else 1
    trail.add("Scaling", f"largest/smallest SD ratio = {ratio:.1f}",
              "Autoscaling (unit variance): every variable gets equal weight, so variables with large units don't dominate."
              if ratio > 3 else "Autoscaling (unit variance), the standard choice; variables have similar spreads.")
    return "autoscale"


# ---------------------------------------------------------------- PCA

def _suitability(X: np.ndarray, trail: Trail, warnings: list[str]) -> dict[str, Any]:
    n, p = X.shape
    R = np.corrcoef(X, rowvar=False)
    det = np.linalg.det(R)
    out: dict[str, Any] = {}
    if det > 0:
        chi2 = -(n - 1 - (2 * p + 5) / 6) * np.log(det)
        df = p * (p - 1) / 2
        pb = stats.chi2.sf(chi2, df)
        out["bartlett"] = {"chi2": chi2, "df": df, "p": pb}
        trail.add("Bartlett's sphericity", f"χ²({df:.0f}) = {chi2:.1f}, p = {pb:.3g}",
                  "Variables are correlated, so PCA can summarise them." if pb < 0.05 else "Variables are nearly uncorrelated; PCA will not reduce dimensionality much.", pb < 0.05)
        if pb >= 0.05:
            warnings.append("Bartlett's test is not significant: the variables share little structure, so each component explains little.")
    try:
        inv = np.linalg.inv(R)
        partial = -inv / np.sqrt(np.outer(np.diag(inv), np.diag(inv)))
        np.fill_diagonal(partial, 0)
        r2 = R.copy()
        np.fill_diagonal(r2, 0)
        kmo = (r2**2).sum() / ((r2**2).sum() + (partial**2).sum())
        out["kmo"] = kmo
        label = "marvellous" if kmo >= 0.9 else "meritorious" if kmo >= 0.8 else "middling" if kmo >= 0.7 else "mediocre" if kmo >= 0.6 else "miserable" if kmo >= 0.5 else "unacceptable"
        trail.add("Kaiser-Meyer-Olkin (KMO)", f"{kmo:.2f} ({label})", "Adequate for PCA." if kmo >= 0.6 else "Low sampling adequacy; interpret components cautiously.", kmo >= 0.6)
    except np.linalg.LinAlgError:
        trail.add("Kaiser-Meyer-Olkin (KMO)", "not computable", "Variables are perfectly collinear (singular correlation matrix).", False)
        warnings.append("Some variables are perfectly collinear (e.g. one is a sum of others).")
    return out


def pca(df: pd.DataFrame, columns: list[str], scaling: str = "auto", n_components: int | None = None, color_by: str | None = None,
        exclude_rows: list[int] | None = None) -> dict[str, Any]:
    if len(columns) < 2:
        raise AnalysisError("Choose at least two numeric columns.")
    data, info = prepare(df, columns, [color_by] if color_by else [], exclude_rows)
    n, p = len(data), len(columns)
    if n < 4:
        raise AnalysisError("PCA needs at least 4 complete rows.")
    trail, warnings = Trail(), []
    X = data[columns].to_numpy(float)
    method = choose_scaling(X, columns, scaling, trail)
    Z, _, _ = scale(X, method)
    suit = _suitability(X, trail, warnings) if n > p else {}
    if n <= p:
        warnings.append(f"Fewer samples ({n}) than variables ({p}): suitability tests are not possible and components beyond n−1 carry no information.")

    U, S, Vt = np.linalg.svd(Z, full_matrices=False)
    eig = S**2 / (n - 1)
    total = eig.sum()
    explained = eig / total
    max_k = min(n - 1, p, MAX_COMPONENTS)

    if n_components:
        k = int(min(n_components, max_k))
        trail.add("Components", str(k), "Chosen by the user.")
    else:
        cum = np.cumsum(explained)
        k80 = int(np.searchsorted(cum, 0.80) + 1)
        kaiser = int((eig > 1).sum()) if method == "autoscale" else k80
        # the more parsimonious of the two rules, but at least 2 for a scores plot
        k = int(min(max_k, max(2, min(k80, kaiser) if kaiser >= 1 else k80)))
        trail.add("Components retained", str(k),
                  f"{k80} component(s) reach 80% of the variance; {kaiser} have eigenvalue > 1 (Kaiser). The smaller is used, with at least 2 for plotting.")

    scores = U[:, :k] * S[:k]
    loadings = Vt[:k].T  # p x k (unit-length eigenvectors)
    corr_loadings = loadings * np.sqrt(eig[:k])  # correlation of each (autoscaled) variable with each PC

    # Hotelling's T² and Q residuals for the retained model
    t2 = ((scores**2) / eig[:k]).sum(axis=1)
    t2_lim = k * (n**2 - 1) / (n * (n - k)) * stats.f.ppf(0.95, k, n - k) if n > k else None
    resid = Z - scores @ loadings.T
    q = (resid**2).sum(axis=1)
    rest = eig[k:]
    q_lim = None
    if len(rest) and rest.sum() > 0:
        th1, th2, th3 = rest.sum(), (rest**2).sum(), (rest**3).sum()
        h0 = 1 - 2 * th1 * th3 / (3 * th2**2)
        if h0 > 0:
            z = stats.norm.ppf(0.95)
            q_lim = th1 * (z * np.sqrt(2 * th2 * h0**2) / th1 + 1 + th2 * h0 * (h0 - 1) / th1**2) ** (1 / h0)
    atypical = [int(idx) for idx, a, b in zip(data.index, t2, q) if (t2_lim and a > t2_lim) or (q_lim and b > q_lim)]
    if atypical:
        trail.add("Atypical samples", f"{len(atypical)} outside the 95% T² or Q limits", "Listed below; check them before interpreting the components (about 5% are expected by chance).", None)

    contrib = (loadings**2) * 100  # % contribution of each variable to each PC
    return clean({
        "type": "pca", "columns": columns, "scaling": method, "data_info": info, "trail": trail.steps, "warnings": warnings,
        "suitability": suit, "n_components": k,
        "eigenvalues": eig[:max_k], "explained": explained[:max_k], "cumulative": np.cumsum(explained)[:max_k],
        "loadings": {"columns": columns, "values": loadings, "correlation": corr_loadings, "contribution_pct": contrib},
        "scores": {"rows": [int(i) for i in data.index], "values": scores, "color": data[color_by].tolist() if color_by else None, "color_by": color_by},
        "diagnostics": {"t2": t2, "t2_limit": t2_lim, "q": q, "q_limit": q_lim, "atypical": atypical},
        "summary": f"PCA on {p} {method}d variables (n = {n}): the first {k} components explain {100 * explained[:k].sum():.1f}% of the variance "
                   f"(PC1 {100 * explained[0]:.1f}%, PC2 {100 * explained[1]:.1f}%).",
    })


# ---------------------------------------------------------------- PLS / PLS-DA

def _vip(model: PLSRegression) -> np.ndarray:
    t, w, q = model.x_scores_, model.x_weights_, model.y_loadings_
    p, a = w.shape
    ss = np.diag(t.T @ t @ q.T @ q).reshape(a, -1)
    wn = (w / np.linalg.norm(w, axis=0)) ** 2
    return np.sqrt(p * (wn @ ss).ravel() / ss.sum())


def _cv_predict(X: np.ndarray, Y: np.ndarray, a: int, splitter, groups_for_split) -> np.ndarray:
    pred = np.zeros_like(Y)
    for tr, te in splitter.split(X, groups_for_split):
        Xs, mx, sx = scale(X[tr], "autoscale")
        Ym, my = Y[tr].mean(axis=0), Y[tr].std(axis=0, ddof=1)
        my[my == 0] = 1
        m = PLSRegression(n_components=a, scale=False).fit(Xs, (Y[tr] - Ym) / my)
        pred[te] = m.predict((X[te] - mx) / sx) * my + Ym
    return pred


def pls(df: pd.DataFrame, predictors: list[str], responses: list[str] | None = None, class_column: str | None = None,
        n_components: int | None = None, permutations: int = 100, exclude_rows: list[int] | None = None) -> dict[str, Any]:
    if len(predictors) < 2:
        raise AnalysisError("Choose at least two predictor (X) columns.")
    da = bool(class_column)
    if not da and not responses:
        raise AnalysisError("Choose numeric response(s) for PLS regression, or a class column for PLS-DA.")
    responses = responses or []
    if set(responses) & set(predictors) or (class_column and class_column in predictors):
        raise AnalysisError("Responses and predictors must be different columns.")
    data, info = prepare(df, predictors + responses, [class_column] if da else [], exclude_rows)
    n = len(data)
    trail, warnings = Trail(), []
    X = data[predictors].to_numpy(float)
    if da:
        classes = sorted(data[class_column].unique())
        if len(classes) < 2:
            raise AnalysisError("The class column needs at least two classes.")
        Y = (data[class_column].to_numpy()[:, None] == np.array(classes)[None, :]).astype(float)
        min_class = int(Y.sum(axis=0).min())
        folds = max(2, min(7, min_class))
        splitter = StratifiedKFold(folds, shuffle=True, random_state=0)
        split_groups = data[class_column].to_numpy()
        trail.add("Model", f"PLS-DA, {len(classes)} classes", f"{folds}-fold stratified cross-validation.")
        if min_class < 5:
            warnings.append(f"The smallest class has {min_class} samples; cross-validated accuracy will be very noisy.")
    else:
        Y = data[responses].to_numpy(float)
        folds = max(2, min(7, n // 3))
        splitter = KFold(folds, shuffle=True, random_state=0)
        split_groups = None
        trail.add("Model", f"PLS regression on {len(responses)} response(s)", f"{folds}-fold cross-validation.")
    if n < 8:
        raise AnalysisError("PLS needs at least 8 complete rows for cross-validation.")
    trail.add("Scaling", "autoscale", "X and Y are autoscaled within each training fold so validation is not leaked.")

    max_a = int(min(MAX_COMPONENTS, len(predictors), n - n // folds - 1))
    tss = ((Y - Y.mean(axis=0)) ** 2).sum()
    q2_cum, press_prev = [], tss
    preds = {}
    chosen = None
    for a in range(1, max_a + 1):
        pr = _cv_predict(X, Y, a, splitter, split_groups)
        press = ((Y - pr) ** 2).sum()
        q2_cum.append(1 - press / tss)
        preds[a] = pr
        q2_comp = 1 - press / press_prev
        if chosen is None and not n_components and q2_comp < 0.0975 and a > 1:
            chosen = a - 1  # SIMCA rule: a component is significant if it improves prediction by > 0.0975
        press_prev = press
    if n_components:
        a = int(min(n_components, max_a))
        trail.add("Components", str(a), "Chosen by the user.")
    else:
        a = chosen or max_a  # None: every component kept improving prediction
        if q2_cum[0] <= 0:
            warnings.append("Even the first component has Q² ≤ 0: X does not predict Y better than the mean.")
        trail.add("Components", f"{a} (Q² = {q2_cum[a - 1]:.3f})", "Added components until one no longer improved cross-validated prediction by 0.0975 (SIMCA rule).")

    Xs, _, _ = scale(X, "autoscale")
    Ym, Ysd = Y.mean(axis=0), Y.std(axis=0, ddof=1)
    Ysd[Ysd == 0] = 1
    model = PLSRegression(n_components=a, scale=False).fit(Xs, (Y - Ym) / Ysd)
    fitted = model.predict(Xs) * Ysd + Ym
    r2y = 1 - ((Y - fitted) ** 2).sum() / tss
    r2x = 1 - ((Xs - model.x_scores_ @ model.x_loadings_.T) ** 2).sum() / (Xs**2).sum()
    q2 = q2_cum[a - 1]
    cvp = preds[a]
    vip = _vip(model)

    # permutation test: is Q² better than with randomly reassigned Y?
    rng = np.random.default_rng(0)
    perm_q2 = []
    for _ in range(permutations):
        Yp = Y[rng.permutation(n)]
        pr = _cv_predict(X, Yp, a, splitter, split_groups if not da else Yp.argmax(axis=1))
        perm_q2.append(1 - ((Yp - pr) ** 2).sum() / ((Yp - Yp.mean(axis=0)) ** 2).sum())
    perm_p = (1 + sum(v >= q2 for v in perm_q2)) / (permutations + 1)

    out: dict[str, Any] = {"type": "pls", "mode": "pls-da" if da else "pls", "predictors": predictors, "responses": responses, "class_column": class_column,
                           "data_info": info, "n_components": a, "r2x": r2x, "r2y": r2y, "q2": q2, "q2_by_component": q2_cum,
                           "permutation": {"n": permutations, "p": perm_p, "q2_values": perm_q2},
                           "vip": sorted([{"variable": v, "vip": s} for v, s in zip(predictors, vip)], key=lambda d: -d["vip"]),
                           "scores": {"rows": [int(i) for i in data.index], "t1": model.x_scores_[:, 0], "t2": model.x_scores_[:, 1] if a > 1 else None,
                                      "color": data[class_column].tolist() if da else Y[:, 0].tolist()}}
    if da:
        pred_class = np.array(classes)[cvp.argmax(axis=1)]
        true = data[class_column].to_numpy()
        acc = float((pred_class == true).mean())
        cm = confusion_matrix(true, pred_class, labels=classes)
        recall = np.diag(cm) / cm.sum(axis=1)
        out.update({"classes": classes, "cv_accuracy": acc, "balanced_accuracy": float(np.nanmean(recall)), "chance_accuracy": float((Y.sum(axis=0) / n).max()),
                    "confusion_matrix": cm, "per_class_recall": recall})
        summary = f"PLS-DA with {a} component(s): cross-validated accuracy {100 * acc:.1f}% (chance {100 * out['chance_accuracy']:.0f}%), Q² = {q2:.2f}, permutation p = {perm_p:.3f}."
    else:
        rmsecv = np.sqrt(((Y - cvp) ** 2).mean(axis=0))
        coef = model.coef_ if model.coef_.shape == (len(predictors), Y.shape[1]) else model.coef_.T  # sklearn versions differ
        xsd = X.std(axis=0, ddof=1)
        xsd[xsd == 0] = 1
        coef_orig = coef * Ysd[None, :] / xsd[:, None]  # change in Y (original units) per unit of X
        out.update({"rmsecv": rmsecv, "observed": Y, "cv_predicted": cvp,
                    "coefficients": [{"variable": v, **{r: float(c) for r, c in zip(responses, row)}} for v, row in zip(predictors, coef_orig)]})
        summary = f"PLS regression with {a} component(s): R²Y = {r2y:.2f}, Q² = {q2:.2f}, RMSECV = {', '.join(f'{v:.3g}' for v in rmsecv)}, permutation p = {perm_p:.3f}."

    # trust verdict
    checks = [
        {"check": "Predictive ability (Q²)", "value": q2, "ok": q2 >= 0.5, "warn": 0.3 <= q2 < 0.5,
         "note": "≥ 0.5 good, 0.3–0.5 moderate, < 0.3 weak (≤ 0 means no predictive ability)."},
        {"check": "Overfitting (R²Y − Q²)", "value": r2y - q2, "ok": r2y - q2 <= 0.2, "warn": 0.2 < r2y - q2 <= 0.3,
         "note": "A gap above 0.2–0.3 means the model fits noise in the training data."},
        {"check": "Permutation test", "value": perm_p, "ok": perm_p < 0.05, "warn": False,
         "note": f"Share of {permutations} models with shuffled Y that predict as well; < 0.05 means the model beats chance."},
        {"check": "Samples per component", "value": n / a, "ok": n / a >= 10, "warn": 5 <= n / a < 10, "note": "Fewer than ~5 samples per component risks overfitting."},
    ]
    if da:
        checks.append({"check": "Accuracy above chance", "value": out["balanced_accuracy"] - 1 / len(classes), "ok": out["balanced_accuracy"] - 1 / len(classes) > 0.2,
                       "warn": 0.05 < out["balanced_accuracy"] - 1 / len(classes) <= 0.2, "note": "Balanced accuracy minus 1/number of classes."})
    fails = [c for c in checks if not c["ok"] and not c["warn"]]
    warns = [c for c in checks if c["warn"]]
    verdict = "red" if fails else "amber" if warns else "green"
    out["verdict"] = {"level": verdict, "checks": checks,
                      "text": {"green": "The model predicts well beyond chance and shows no sign of overfitting.",
                               "amber": "Usable with caution: see the checks marked amber.",
                               "red": "Do not rely on this model for interpretation or prediction: at least one critical check failed."}[verdict]}
    trail.add("Permutation test", f"p = {perm_p:.3f} ({permutations} permutations)", "Model is better than chance." if perm_p < 0.05 else "Model is not distinguishable from chance.", perm_p < 0.05)
    out.update({"trail": trail.steps, "warnings": warnings, "summary": summary})
    return clean(out)


# ---------------------------------------------------------------- clustering

def cluster(df: pd.DataFrame, columns: list[str], method: str = "auto", k: int | None = None, compare_with: str | None = None,
            exclude_rows: list[int] | None = None) -> dict[str, Any]:
    if len(columns) < 1:
        raise AnalysisError("Choose at least one numeric column.")
    data, info = prepare(df, columns, [compare_with] if compare_with else [], exclude_rows)
    n = len(data)
    if n < 6:
        raise AnalysisError("Clustering needs at least 6 complete rows.")
    trail, warnings = Trail(), []
    X = data[columns].to_numpy(float)
    Z, _, _ = scale(X, "autoscale")
    trail.add("Scaling", "autoscale", "Distances would otherwise be dominated by the variables with the largest units.")

    ks = [k] if k else list(range(2, min(10, n - 1) + 1))
    methods = ["kmeans", "ward"] if method == "auto" else [method]
    link = linkage(Z, "ward")
    sil: dict[str, list[float | None]] = {m: [] for m in methods}
    labels: dict[tuple[str, int], np.ndarray] = {}
    for m in methods:
        for kk in ks:
            lab = KMeans(kk, n_init=10, random_state=0).fit_predict(Z) if m == "kmeans" else fcluster(link, kk, "maxclust") - 1
            labels[(m, kk)] = lab
            sil[m].append(silhouette_score(Z, lab) if len(set(lab)) > 1 else None)
    best_m, best_k, best_s = None, None, -2.0
    for m in methods:
        for kk, s in zip(ks, sil[m]):
            if s is not None and s > best_s + 1e-9:
                best_m, best_k, best_s = m, kk, s
    if best_m is None:
        raise AnalysisError("Could not form clusters (all points identical?).")
    trail.add("Number of clusters and method", f"{'k-means' if best_m == 'kmeans' else 'Ward hierarchical'}, k = {best_k}",
              f"Highest average silhouette width ({best_s:.2f}) among {len(methods)} method(s) and k = {ks[0]}–{ks[-1]}.")
    strength = "strong" if best_s > 0.7 else "reasonable" if best_s > 0.5 else "weak" if best_s > 0.25 else "no substantial"
    trail.add("Structure (Kaufman & Rousseeuw)", f"silhouette {best_s:.2f}: {strength} structure", "Clusters are well separated." if best_s > 0.5 else "Clusters overlap; treat them as a convenient partition, not natural groups.", best_s > 0.5)
    if best_s <= 0.25:
        warnings.append("Silhouette ≤ 0.25: the data show no substantial cluster structure. Any partition here is largely arbitrary.")

    lab = labels[(best_m, best_k)]
    sizes = np.bincount(lab, minlength=best_k)
    centroids = [{"cluster": int(c) + 1, "n": int(sizes[c]), **{col: float(X[lab == c, j].mean()) for j, col in enumerate(columns)}} for c in range(best_k)]
    U, S, _ = np.linalg.svd(Z, full_matrices=False)
    proj = U[:, :2] * S[:2] if Z.shape[1] >= 2 else np.c_[Z[:, 0], np.zeros(n)]
    dend = dendrogram(link, no_plot=True, labels=[str(i + 1) for i in data.index], color_threshold=link[-(best_k - 1), 2] if best_k > 1 else 0)

    out = {"type": "cluster", "columns": columns, "data_info": info, "method": best_m, "k": best_k, "silhouette": best_s, "structure": strength,
           "silhouette_by_k": {"k": ks, **sil}, "sizes": sizes, "centroids": centroids,
           "assignments": {"rows": [int(i) for i in data.index], "cluster": (lab + 1).tolist()},
           "projection": {"x": proj[:, 0], "y": proj[:, 1]},
           "dendrogram": {"icoord": dend["icoord"], "dcoord": dend["dcoord"], "labels": dend["ivl"], "colors": dend["color_list"]},
           "trail": trail.steps, "warnings": warnings}
    if compare_with:
        ari = adjusted_rand_score(data[compare_with].to_numpy(), lab)
        out["agreement"] = {"column": compare_with, "adjusted_rand": ari,
                            "crosstab": pd.crosstab(data[compare_with], lab + 1).reset_index().to_dict(orient="records")}
    if min(sizes) == 1:
        warnings.append("A cluster contains a single sample; it may be an outlier rather than a group.")
    out["summary"] = (f"{'k-means' if best_m == 'kmeans' else 'Ward hierarchical clustering'} gave {best_k} clusters (sizes {', '.join(map(str, sizes))}); "
                      f"average silhouette {best_s:.2f} ({strength} structure)." + (f" Agreement with '{compare_with}': adjusted Rand index {out['agreement']['adjusted_rand']:.2f}." if compare_with else ""))
    return clean(out)
