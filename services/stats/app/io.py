"""Reading uploaded tabular files into DataFrames."""

from __future__ import annotations

import io

import pandas as pd

MAX_ROWS = 200_000
MAX_COLS = 500


class DataReadError(ValueError):
    pass


def read_table(content: bytes, filename: str) -> pd.DataFrame:
    name = filename.lower()
    try:
        if name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        elif name.endswith((".csv", ".tsv", ".txt")):
            # sep=None lets the python engine sniff , ; \t |
            df = pd.read_csv(io.BytesIO(content), sep=None, engine="python")
        else:
            raise DataReadError("Unsupported file type. Use CSV, TSV or XLSX.")
    except DataReadError:
        raise
    except Exception as exc:  # pandas raises many types
        raise DataReadError(f"Could not parse file: {exc}") from exc

    if df.empty:
        raise DataReadError("The file contains no rows.")
    if len(df) > MAX_ROWS:
        raise DataReadError(f"File has {len(df)} rows; the limit is {MAX_ROWS}.")
    if df.shape[1] > MAX_COLS:
        raise DataReadError(f"File has {df.shape[1]} columns; the limit is {MAX_COLS}.")

    df.columns = [str(c).strip() or f"column_{i + 1}" for i, c in enumerate(df.columns)]
    if df.columns.duplicated().any():
        raise DataReadError("Column names must be unique.")
    return df
