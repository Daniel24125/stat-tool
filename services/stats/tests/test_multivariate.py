import json

import numpy as np
import pandas as pd
import pytest
from sklearn.datasets import load_iris

from app.common import AnalysisError
from app.multivariate import cluster, pca, pls

iris = load_iris(as_frame=True)
IRIS = iris.frame.rename(columns=lambda c: c.replace(" (cm)", "").replace(" ", "_"))
IRIS["species"] = iris.target_names[iris.target]
FEATURES = ["sepal_length", "sepal_width", "petal_length", "petal_width"]


def test_pca_iris_matches_published_variance():
    # Autoscaled iris: PC1 72.96%, PC2 22.85% (standard textbook result)
    r = pca(IRIS, FEATURES, color_by="species")
    assert r["scaling"] == "autoscale"
    assert r["explained"][0] == pytest.approx(0.7296, abs=1e-3)
    assert r["explained"][1] == pytest.approx(0.2285, abs=1e-3)
    assert r["n_components"] == 2
    assert r["suitability"]["kmo"] < 0.6  # iris KMO is known to be low (~0.54)
    assert r["diagnostics"]["t2_limit"] > 0 and r["diagnostics"]["q_limit"] > 0
    json.dumps(r, allow_nan=False)


def test_pls_regression_good_and_null_models():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(60, 8))
    y = X[:, 0] * 2 - X[:, 1] + rng.normal(0, 0.3, 60)
    df = pd.DataFrame(X, columns=[f"x{i}" for i in range(8)]).assign(y=y, noise=rng.normal(size=60))
    good = pls(df, [f"x{i}" for i in range(8)], ["y"], permutations=30)
    assert good["q2"] > 0.8 and good["permutation"]["p"] < 0.05
    assert good["verdict"]["level"] == "green"
    assert [v["variable"] for v in good["vip"][:2]] == ["x0", "x1"]
    coef = {c["variable"]: c["y"] for c in good["coefficients"]}
    assert coef["x0"] == pytest.approx(2, abs=0.3)
    bad = pls(df, [f"x{i}" for i in range(8)], ["noise"], permutations=30)
    assert bad["verdict"]["level"] == "red"


def test_plsda_iris():
    r = pls(IRIS, FEATURES, class_column="species", permutations=20)
    assert r["mode"] == "pls-da"
    assert r["cv_accuracy"] > 0.8
    assert r["permutation"]["p"] < 0.05


def test_cluster_iris():
    r = cluster(IRIS, FEATURES, compare_with="species")
    assert r["k"] in (2, 3)
    assert r["silhouette"] > 0.4
    assert r["agreement"]["adjusted_rand"] > 0.4
    assert len(r["dendrogram"]["labels"]) == 150


def test_cluster_no_structure_warns():
    rng = np.random.default_rng(1)
    df = pd.DataFrame(rng.uniform(size=(80, 3)), columns=list("abc"))
    r = cluster(df, list("abc"))
    assert r["silhouette"] < 0.4
    assert r["structure"] in ("weak", "no substantial")


def test_input_errors():
    with pytest.raises(AnalysisError):
        pca(IRIS, ["sepal_length"])
    with pytest.raises(AnalysisError):
        pls(IRIS, FEATURES)
