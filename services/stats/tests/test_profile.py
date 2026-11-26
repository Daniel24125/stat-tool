import os

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

os.environ["INTERNAL_API_KEY"] = "test-key"

from app.main import app  # noqa: E402

client = TestClient(app)
HEADERS = {"X-Internal-Key": "test-key"}


def make_csv() -> bytes:
    rng = np.random.default_rng(0)
    n = 60
    df = pd.DataFrame(
        {
            "id": range(1, n + 1),
            "treatment": np.repeat(["A", "B", "C"], n // 3),
            "temp": np.tile([20, 30], n // 2),
            "yield": rng.normal(50, 5, n),
            "skewed": rng.exponential(2, n),
            "counts": np.arange(n) ** 2,  # unique integers, but a measurement, not an ID
        }
    )
    df.loc[3, "yield"] = None
    return df.to_csv(index=False).encode()


def test_requires_key():
    r = client.post("/v1/profile", files={"file": ("d.csv", make_csv(), "text/csv")})
    assert r.status_code == 401


def test_profile_kinds_and_normality():
    r = client.post("/v1/profile", files={"file": ("d.csv", make_csv(), "text/csv")}, headers=HEADERS)
    assert r.status_code == 200, r.text
    body = r.json()
    kinds = {c["name"]: c["kind"] for c in body["columns"]}
    assert kinds == {"id": "identifier", "treatment": "categorical", "temp": "binary", "yield": "numeric", "skewed": "numeric", "counts": "numeric"}
    cols = {c["name"]: c for c in body["columns"]}
    assert cols["yield"]["missing"] == 1
    assert cols["yield"]["numeric"]["normality"]["test"] == "Shapiro-Wilk"
    assert cols["skewed"]["numeric"]["normality"]["normal"] is False
    assert body["correlation"]["method"] == "spearman"
    assert body["complete_rows"] == 59


def test_bad_file():
    r = client.post("/v1/profile", files={"file": ("d.pdf", b"x", "application/pdf")}, headers=HEADERS)
    assert r.status_code == 422
