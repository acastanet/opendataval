from __future__ import annotations

from pathlib import Path

import cdsapi
import requests


class CopernicusDownloadError(RuntimeError):
    """Erreur CDS nettoyée de tout détail d'authentification."""


class CopernicusClient:
    def __init__(self, *, url: str, key: str) -> None:
        self._client = cdsapi.Client(
            url=url,
            key=key,
            quiet=True,
            progress=False,
            timeout=300,
        )

    def download(self, *, dataset: str, request: dict[str, object], target: Path) -> Path:
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._client.retrieve(dataset, request, str(target))
        except requests.HTTPError as exc:
            message = str(exc).lower()
            if "licence" in message or "license" in message or "terms" in message:
                raise CopernicusDownloadError(
                    "Copernicus indisponible : conditions du jeu de données non acceptées"
                ) from None
            if exc.response is not None and exc.response.status_code in {401, 403}:
                raise CopernicusDownloadError(
                    "Copernicus indisponible : authentification CDS refusée"
                ) from None
            raise CopernicusDownloadError(
                "Copernicus indisponible : requête CDS refusée"
            ) from None
        except Exception:
            raise CopernicusDownloadError(
                "Copernicus indisponible : source distante inaccessible"
            ) from None

        if not target.exists() or target.stat().st_size == 0:
            raise CopernicusDownloadError(
                "Copernicus indisponible : fichier reçu vide ou incomplet"
            )
        return target
