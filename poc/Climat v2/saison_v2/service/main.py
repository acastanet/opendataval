"""API FastAPI publique du cadran des saisons thermiques."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .collector import CollectionError, CoordinatesError, CredentialsError
from .generator import WheelBundle, generate_wheel
from .validation import TechnicalValidationError

ROOT = Path(__file__).resolve().parents[1]
STATIC = Path(__file__).resolve().parent / "static"

app = FastAPI(
    title="Cadran des saisons thermiques",
    version="1.0.0",
    description="Génère un cadran SVG ou PNG depuis un point GPS avec ERA5-Land.",
)

origins = [value.strip() for value in os.getenv("CORS_ORIGINS", "*").split(",") if value.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.mount("/vignettes", StaticFiles(directory=STATIC / "vignettes"), name="vignettes")


def _bundle(latitude: float, longitude: float, title: str | None = None) -> WheelBundle:
    try:
        return generate_wheel(latitude, longitude, title)
    except CoordinatesError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CredentialsError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except CollectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except TechnicalValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": exc.code, "message": exc.message, "diagnostics": exc.diagnostics},
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _filename(latitude: float, longitude: float, extension: str) -> str:
    return f"cadran-saisons-{latitude:.5f}-{longitude:.5f}.{extension}"


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def homepage() -> HTMLResponse:
    return HTMLResponse((STATIC / "index.html").read_text(encoding="utf-8"))


@app.get("/app.css", include_in_schema=False)
def stylesheet() -> FileResponse:
    return FileResponse(STATIC / "app.css", media_type="text/css")


@app.get("/app.js", include_in_schema=False)
def javascript() -> FileResponse:
    return FileResponse(STATIC / "app.js", media_type="text/javascript")


@app.get("/healthz", tags=["service"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/wheel.svg", tags=["cadran"])
def wheel_svg(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    title: str | None = Query(None, max_length=80, description="Titre affiché dans le cadran."),
    download: bool = False,
) -> FileResponse:
    bundle = _bundle(lat, lon, title)
    return FileResponse(
        bundle.svg_path,
        media_type="image/svg+xml",
        filename=_filename(lat, lon, "svg") if download else None,
    )


@app.get("/api/v1/wheel.png", tags=["cadran"])
def wheel_png(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    title: str | None = Query(None, max_length=80, description="Titre affiché dans le cadran."),
    download: bool = False,
) -> FileResponse:
    bundle = _bundle(lat, lon, title)
    return FileResponse(
        bundle.png_path,
        media_type="image/png",
        filename=_filename(lat, lon, "png") if download else None,
    )


@app.get("/api/v1/wheel", tags=["cadran"])
def wheel(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    title: str | None = Query(None, max_length=80, description="Titre affiché dans le cadran."),
    format: Literal["svg", "png", "json"] = "svg",
) -> Response:
    bundle = _bundle(lat, lon, title)
    if format == "json":
        return JSONResponse(json.loads(bundle.result_path.read_text(encoding="utf-8")))
    path = bundle.svg_path if format == "svg" else bundle.png_path
    return FileResponse(path, media_type=f"image/{'svg+xml' if format == 'svg' else 'png'}")
