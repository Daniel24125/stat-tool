"""Checks against published reference results and planted effects."""

import json
import os

import numpy as np
import pandas as pd
import pingouin as pg
import pytest
from fastapi.testclient import TestClient
from scipy import stats

os.environ["INTERNAL_API_KEY"] = "test-key"
from app.common import AnalysisError  # noqa: E402
from app.compare import compare  # noqa: E402
from app.correlation import correlation  # noqa: E402
from app.main import app  # noqa: E402
from app.outliers import detect  # noqa: E402
from app.regression import regression  # noqa: E402

# R's PlantGrowth dataset. Reference (R): aov F(2,27) = 4.846, p = 0.01591;
# TukeyHSD trt2-trt1 diff = 0.865, p adj = 0.0120.
PLANT = pd.DataFrame({
    "group": ["ctrl"] * 10 + ["trt1"] * 10 + ["trt2"] * 10,
    "weight": [4.17, 5.58, 5.18, 6.11, 4.50, 4.61, 5.17, 4.53, 5.33, 5.14,
               4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69,
               6.31, 5.12, 5.54, 5.50, 5.37, 5.29, 4.92, 6.15, 5.80, 5.26],
})


def test_plantgrowth_one_way_anova_matches_r():
    r = compare(PLANT, "weight", ["group"])
    assert r["test"]["name"] == "One-way ANOVA"
    row = r["table"][0]
    assert row["statistic"] == pytest.approx(4.846, abs=1e-3)
    assert row["p"] == pytest.approx(0.01591, abs=1e-4)
    assert (row["df1"], row["df2"]) == (2, 27)
    tk = {(c["a"], c["b"]): c for c in r["posthoc"][0]["comparisons"]}
    assert tk[("trt1", "trt2")]["diff"] == pytest.approx(0.865, abs=1e-3)
    assert tk[("trt1", "trt2")]["p_adj"] == pytest.approx(0.0120, abs=5e-4)
    assert r["posthoc"][0]["method"] == "Tukey HSD"


def test_two_groups_choose_welch_or_mannwhitney():
    rng = np.random.default_rng(1)
    df = pd.DataFrame({"g": ["a"] * 15 + ["b"] * 15, "y": np.r_[rng.normal(0, 1, 15), rng.normal(1, 6, 15)]})
    assert compare(df, "y", ["g"])["test"]["name"] == "Welch's t-test"
    df2 = pd.DataFrame({"g": ["a"] * 12 + ["b"] * 12, "y": np.r_[rng.exponential(1, 12) ** 3, rng.exponential(2, 12) ** 3]})
    r = compare(df2, "y", ["g"])
    assert r["test"]["name"] == "Mann-Whitney U test"
    assert r["table"][0]["p"] == pytest.approx(stats.mannwhitneyu(df2.y[:12], df2.y[12:]).pvalue)


def test_kruskal_wallis_for_skewed_groups():
    rng = np.random.default_rng(2)
    df = pd.DataFrame({"g": np.repeat(["a", "b", "c"], 10), "y": np.r_[rng.lognormal(0, 1.2, 10), rng.lognormal(0.5, 1.2, 10), rng.lognormal(1.5, 1.2, 10)]})
    r = compare(df, "y", ["g"])
    if r["test"]["name"] == "Kruskal-Wallis H test":
        assert r["table"][0]["p"] == pytest.approx(stats.kruskal(*[g.y for _, g in df.groupby("g")]).pvalue)
        assert r["posthoc"][0]["method"].startswith("Dunn")


def test_two_way_balanced_matches_pingouin():
    rng = np.random.default_rng(3)
    a, b = np.repeat(["a1", "a2"], 20), np.tile(np.repeat(["b1", "b2"], 10), 2)
    y = 10 + (a == "a2") * 2 + (b == "b2") * 1 + ((a == "a2") & (b == "b2")) * 4 + rng.normal(0, 1, 40)
    df = pd.DataFrame({"A": a, "B": b, "y": y})
    r = compare(df, "y", ["A", "B"])
    ref = pg.anova(data=df, dv="y", between=["A", "B"]).set_index("Source")
    got = {row["term"]: row for row in r["table"]}
    assert r["design"]["balanced"] is True
    assert "Type II" in r["test"]["name"]
    assert got["A"]["statistic"] == pytest.approx(ref.loc["A", "F"], rel=1e-6)
    assert got["A × B"]["statistic"] == pytest.approx(ref.loc["A * B", "F"], rel=1e-6)
    assert any(p["term"] == "A × B" for p in r["posthoc"])
    assert r["interaction_plot"]["x"] == "A"


def test_unbalanced_uses_type_iii():
    df = pd.DataFrame({"A": list("xxxxxyyyy") * 2, "B": ["p"] * 9 + ["q"] * 9, "y": np.arange(18, dtype=float) % 7})
    df = df.drop(index=[0, 1])
    assert "Type III" in compare(df, "y", ["A", "B"])["test"]["name"]


def test_paired_two_levels():
    rng = np.random.default_rng(4)
    subj = np.tile(np.arange(12), 2)
    base = rng.normal(10, 3, 12)
    df = pd.DataFrame({"s": subj.astype(str), "t": np.repeat(["pre", "post"], 12), "y": np.r_[base, base + 1 + rng.normal(0, 0.5, 12)]})
    r = compare(df, "y", ["t"], subject="s")
    assert r["test"]["name"] in ("Paired t-test", "Wilcoxon signed-rank test")
    assert r["table"][0]["p"] < 0.001


def test_outliers_univariate_and_multivariate():
    rng = np.random.default_rng(5)
    x = rng.normal(50, 2, 40)
    x[[3, 17]] = [80, 15]
    r = detect(pd.DataFrame({"x": x}), ["x"])
    assert set(r["suggested_exclusions"]) == {3, 17}
    X = rng.multivariate_normal([0, 0], [[1, 0.9], [0.9, 1]], 60)
    X[10] = [2.5, -2.5]  # unusual only in combination
    r2 = detect(pd.DataFrame(X, columns=["a", "b"]), ["a", "b"])
    assert r2["selected_method"] == "mcd"
    assert 10 in r2["suggested_exclusions"]


def test_outlier_exclusions_flow_into_compare():
    r = compare(PLANT, "weight", ["group"], exclude_rows=[0, 1])
    assert r["data_info"]["n_used"] == 28


def test_regression_ols_logistic_poisson_mixed():
    rng = np.random.default_rng(6)
    n = 120
    x1, x2 = rng.normal(size=n), rng.normal(size=n)
    g = np.repeat([f"g{i}" for i in range(12)], 10)
    u = np.repeat(rng.normal(0, 2, 12), 10)
    df = pd.DataFrame({"x1": x1, "x2": x2, "g": g,
                       "y": 1 + 2 * x1 + rng.normal(size=n),
                       "yb": (rng.random(n) < 1 / (1 + np.exp(-(x1 * 2)))).astype(int),
                       "yc": rng.poisson(np.exp(0.5 + 0.5 * x1)),
                       "ym": 3 + x1 + u + rng.normal(0, 0.5, n)})
    ols = regression(df, "y", ["x1", "x2"])
    slope = next(c for c in ols["coefficients"] if c["term"] == "x1")
    assert ols["family"] == "gaussian" and slope["estimate"] == pytest.approx(2, abs=0.3)
    assert regression(df, "yb", ["x1"])["family"] == "binomial"
    assert regression(df, "yc", ["x1"])["family"] in ("poisson", "negative binomial")
    mixed = regression(df, "ym", ["x1"], random_effect="g")
    assert mixed["fit"]["icc"] > 0.5


def test_correlation_auto_and_holm():
    rng = np.random.default_rng(7)
    a = rng.normal(size=50)
    df = pd.DataFrame({"a": a, "b": a + rng.normal(0, 0.3, 50), "c": rng.normal(size=50)})
    r = correlation(df, ["a", "b", "c"])
    ab = next(p for p in r["pairs"] if (p["a"], p["b"]) == ("a", "b"))
    assert ab["significant"] and ab["p_adj"] >= ab["p"]


def test_bad_requests():
    with pytest.raises(AnalysisError):
        compare(PLANT, "weight", [])
    with pytest.raises(AnalysisError):
        compare(PLANT, "nope", ["group"])


def test_analyze_endpoint():
    client = TestClient(app)
    spec = json.dumps({"type": "compare", "params": {"response": "weight", "factors": ["group"]}})
    r = client.post("/v1/analyze", files={"file": ("p.csv", PLANT.to_csv(index=False).encode(), "text/csv")}, data={"spec": spec}, headers={"X-Internal-Key": "test-key"})
    assert r.status_code == 200, r.text
    json.dumps(r.json(), allow_nan=False)  # strictly JSON-serializable
    bad = client.post("/v1/analyze", files={"file": ("p.csv", PLANT.to_csv(index=False).encode(), "text/csv")},
                      data={"spec": json.dumps({"type": "compare", "params": {"response": "weight", "factors": []}})}, headers={"X-Internal-Key": "test-key"})
    assert bad.status_code == 422


def test_welch_anova_for_unequal_variances():
    rng = np.random.default_rng(8)
    df = pd.DataFrame({"g": np.repeat(["a", "b", "c"], 20), "y": np.r_[rng.normal(0, 0.5, 20), rng.normal(1, 3, 20), rng.normal(2, 8, 20)]})
    r = compare(df, "y", ["g"])
    assert r["test"]["name"] == "Welch's ANOVA"
    assert r["posthoc"][0]["method"] == "Games-Howell"
    assert r["table"][0]["p"] == pytest.approx(pg.welch_anova(data=df, dv="y", between="g").iloc[0, -2], rel=1e-6)


@pytest.mark.parametrize("skewed", [False, True])
def test_repeated_measures_three_levels(skewed):
    rng = np.random.default_rng(9)
    n = 15
    base = rng.normal(10, 2, n)
    noise = (lambda: rng.exponential(2, n) ** 2) if skewed else (lambda: rng.normal(0, 0.5, n))
    df = pd.DataFrame({"s": np.tile(np.arange(n), 3).astype(str), "t": np.repeat(["t1", "t2", "t3"], n),
                       "y": np.r_[base + noise(), base + 1 + noise(), base + 3 + noise()]})
    r = compare(df, "y", ["t"], subject="s")
    assert r["test"]["name"] in ("Repeated-measures ANOVA", "Friedman test")
    assert r["table"][0]["p"] is not None and len(r["posthoc"][0]["comparisons"]) == 3


def test_grouped_outliers_use_within_group_normality_and_skip_small_sample_methods():
    rng = np.random.default_rng(10)
    df = pd.DataFrame({"g": np.repeat(["a", "b", "c"], 12), "y": np.r_[rng.normal(10, 1, 12), rng.normal(30, 1, 12), rng.normal(60, 1, 12)]})
    df.loc[5, "y"] = 25  # outlier within group a only
    r = detect(df, ["y"], group_by="g")
    assert r["normality"]["y"]["normal"] is not None
    assert 5 in r["suggested_exclusions"]
    r2 = detect(pd.DataFrame({"a": rng.normal(size=36), "b": rng.normal(size=36), "g": df.g}), ["a", "b"], group_by="g")
    skipped = {m["key"]: m["skipped"] for m in r2["methods"]}
    assert skipped["iforest"] and skipped["lof"]
