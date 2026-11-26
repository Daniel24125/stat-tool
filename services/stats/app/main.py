"""StatTool statistics service.

Only the Next.js server calls this service. Requests carry a shared secret in
the X-Internal-Key header; end users never talk to it directly.
"""

from __future__ import annotations

import hmac
import os
import platform
from importlib.metadata import PackageNotFoundError, version

from typing import Any, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ValidationError

from .common import AnalysisError
from .compare import compare
from .correlation import correlation
from .io import DataReadError, read_table
from .multivariate import cluster, pca, pls
from .outliers import detect
from .profiling import profile
from .regression import regression

MAX_UPLOAD_BYTES = 50 * 1024 * 1024

app = FastAPI(title="StatTool stats service", version="0.1.0")


def require_internal_key(x_internal_key: str = Header(default="")) -> None:
    expected = os.environ.get("INTERNAL_API_KEY", "")
    if not expected:
        raise HTTPException(500, "INTERNAL_API_KEY is not configured on the stats service.")
    if not hmac.compare_digest(x_internal_key, expected):
        raise HTTPException(401, "Invalid internal key.")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/v1/meta/versions", dependencies=[Depends(require_internal_key)])
def versions() -> dict:
    libs = {}
    for pkg in ["numpy", "pandas", "scipy", "statsmodels", "scikit-learn", "pingouin", "scikit-posthocs", "pyDOE3", "pyod"]:
        try:
            libs[pkg] = version(pkg)
        except PackageNotFoundError:
            pass
    return {"python": platform.python_version(), "libraries": libs}


async def _load(file: UploadFile):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 50 MB.")
    try:
        return read_table(content, file.filename or "data.csv")
    except DataReadError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/v1/profile", dependencies=[Depends(require_internal_key)])
async def profile_endpoint(file: UploadFile = File(...)) -> dict:
    return profile(await _load(file))


class Spec(BaseModel):
    type: Literal["outliers", "compare", "regression", "correlation", "pca", "pls", "cluster"]
    params: dict[str, Any] = {}
    exclude_rows: list[int] = []


ANALYSES = {
    "outliers": lambda df, p, ex: detect(df, p.get("columns", []), p.get("group_by"), p.get("method", "auto"), ex),
    "compare": lambda df, p, ex: compare(df, p.get("response", ""), p.get("factors", []), p.get("subject"), ex),
    "regression": lambda df, p, ex: regression(df, p.get("response", ""), p.get("predictors", []), p.get("categorical", []),
                                               p.get("family", "auto"), p.get("random_effect"), ex),
    "correlation": lambda df, p, ex: correlation(df, p.get("columns", []), p.get("method", "auto"), ex),
    "pca": lambda df, p, ex: pca(df, p.get("columns", []), p.get("scaling", "auto"), p.get("n_components"), p.get("color_by"), ex),
    "pls": lambda df, p, ex: pls(df, p.get("predictors", []), p.get("responses"), p.get("class_column"), p.get("n_components"), 100, ex),
    "cluster": lambda df, p, ex: cluster(df, p.get("columns", []), p.get("method", "auto"), p.get("k"), p.get("compare_with"), ex),
}


@app.post("/v1/analyze", dependencies=[Depends(require_internal_key)])
async def analyze(file: UploadFile = File(...), spec: str = Form(...)) -> dict:
    try:
        s = Spec.model_validate_json(spec)
    except ValidationError as exc:
        raise HTTPException(422, f"Invalid analysis spec: {exc.errors()[0]['msg']}") from exc
    df = await _load(file)
    try:
        # CPU-bound work off the event loop so /health stays responsive.
        return await run_in_threadpool(ANALYSES[s.type], df, s.params, s.exclude_rows)
    except AnalysisError as exc:
        raise HTTPException(422, str(exc)) from exc
