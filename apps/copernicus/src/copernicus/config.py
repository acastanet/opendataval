from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


class ConfigurationError(RuntimeError):
    """Configuration serveur absente ou invalide, sans inclure les secrets."""


@dataclass(frozen=True)
class Settings:
    cds_url: str
    cds_key: str
    database_dsn: str
    download_dir: Path
    force_download: bool

    @classmethod
    def from_env(cls) -> "Settings":
        cds_url = os.getenv("COPERNICUS_CDS_URL", "").strip()
        cds_key = os.getenv("COPERNICUS_CDS_KEY", "").strip()
        password = os.getenv("POSTGRES_PASSWORD", "")
        if not cds_url or not cds_key:
            raise ConfigurationError("Copernicus désactivé : clé ou URL CDS absente")
        if not password:
            raise ConfigurationError("Base de données indisponible : mot de passe absent")

        host = os.getenv("POSTGRES_HOST", "db")
        port = os.getenv("POSTGRES_PORT", "5432")
        user = os.getenv("POSTGRES_USER", "opendata")
        database = os.getenv("POSTGRES_DB", "opendata_vda")
        # Le DSN reste interne au processus et ne doit jamais être journalisé.
        dsn = f"host={host} port={port} user={user} password={password} dbname={database}"
        return cls(
            cds_url=cds_url,
            cds_key=cds_key,
            database_dsn=dsn,
            download_dir=Path(os.getenv("COPERNICUS_DOWNLOAD_DIR", "data/downloads")),
            force_download=os.getenv("COPERNICUS_FORCE_DOWNLOAD", "false").lower() == "true",
        )
