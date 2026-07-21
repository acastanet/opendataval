from __future__ import annotations

import logging
import os
import sys
import time
import calendar
from datetime import date, datetime, timedelta
from pathlib import Path

from .client import CopernicusClient, CopernicusDownloadError
from .config import ConfigurationError, Settings
from .process.assets import kelvin_to_celsius, read_csv_series, read_netcdf_series
from .process.climatology import compute_climatology
from .process.monthly_thermal import compute_monthly_thermal, previous_month
from .repository import ReferencePoint, Repository
from .requests.climatology import DATASET_NAME as CLIMATOLOGY_DATASET
from .requests.climatology import DATASET_VERSION as CLIMATOLOGY_VERSION
from .requests.climatology import build_climatology_request
from .requests.monthly_thermal import DATASET_NAME as THERMAL_DATASET
from .requests.monthly_thermal import DATASET_VERSION as THERMAL_VERSION
from .requests.monthly_thermal import REFERENCE_DATASET_NAME, REFERENCE_DATASET_VERSION
from .requests.monthly_thermal import build_monthly_request, build_reference_utci_request


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("copernicus")

JOB_CLIMATOLOGY = "meteo_climatologie_points"
JOB_THERMAL = "thermal_monthly"


def _asset(
    *,
    settings: Settings,
    client: CopernicusClient,
    dataset: str,
    request: dict[str, object],
    target: Path,
) -> Path:
    if target.exists() and target.stat().st_size > 0 and not settings.force_download:
        logger.info("Fichier brut réutilisé : %s", target.name)
        return target
    logger.info("Téléchargement CDS : jeu=%s fichier=%s", dataset, target.name)
    return client.download(dataset=dataset, request=request, target=target)


def _climatology_asset(
    point: ReferencePoint,
    *,
    settings: Settings,
    client: CopernicusClient,
) -> Path:
    target = settings.download_dir / f"era5-land_{point.slug}_timeseries.csv"
    return _asset(
        settings=settings,
        client=client,
        dataset=CLIMATOLOGY_DATASET,
        request=build_climatology_request(latitude=point.latitude, longitude=point.longitude),
        target=target,
    )


def _monthly_temperature_asset(
    point: ReferencePoint,
    *,
    year: int,
    month: int,
    settings: Settings,
    client: CopernicusClient,
) -> Path:
    last_day = calendar.monthrange(year, month)[1]
    target = settings.download_dir / f"era5-land_{point.slug}_{year}_{month:02d}.csv"
    return _asset(
        settings=settings,
        client=client,
        dataset=CLIMATOLOGY_DATASET,
        request=build_climatology_request(
            latitude=point.latitude,
            longitude=point.longitude,
            start_date=f"{year}-{month:02d}-01",
            end_date=f"{year}-{month:02d}-{last_day:02d}",
        ),
        target=target,
    )


def run_climatology(settings: Settings, repository: Repository, client: CopernicusClient) -> int:
    total = 0
    for point in repository.points():
        asset = _climatology_asset(point, settings=settings, client=client)
        temperature = kelvin_to_celsius(
            read_csv_series(asset, value_hints=("2m_temperature", "t2m"))
        )
        rows = compute_climatology(temperature)
        total += repository.upsert_climatology(
            point=point,
            rows=rows,
            product="ERA5-Land time-series",
            product_version=CLIMATOLOGY_VERSION,
        )
        logger.info("Climatologie enregistrée : point=%s lignes=%s", point.slug, len(rows))
    return total


def _target_month() -> tuple[int, int]:
    configured = os.getenv("COPERNICUS_TARGET_MONTH", "").strip()
    if configured:
        try:
            parsed = datetime.strptime(configured, "%Y-%m")
        except ValueError as exc:
            raise ConfigurationError("COPERNICUS_TARGET_MONTH doit suivre le format AAAA-MM") from exc
        return parsed.year, parsed.month
    return previous_month(date.today())


def run_monthly_thermal(settings: Settings, repository: Repository, client: CopernicusClient) -> int:
    year, month = _target_month()
    product_type = os.getenv("COPERNICUS_PRODUCT_TYPE", "intermediate_dataset")
    total = 0
    for point in repository.points():
        monthly_target = settings.download_dir / f"era5-heat_{point.slug}_{year}_{month:02d}.nc"
        monthly_asset = _asset(
            settings=settings,
            client=client,
            dataset=THERMAL_DATASET,
            request=build_monthly_request(
                year=year,
                month=month,
                latitude=point.latitude,
                longitude=point.longitude,
                product_type=product_type,
            ),
            target=monthly_target,
        )
        reference_target = settings.download_dir / f"era5-heat_{point.slug}_timeseries.csv"
        reference_asset = _asset(
            settings=settings,
            client=client,
            dataset=REFERENCE_DATASET_NAME,
            request=build_reference_utci_request(
                latitude=point.latitude,
                longitude=point.longitude,
            ),
            target=reference_target,
        )
        temperature_asset = _monthly_temperature_asset(
            point,
            year=year,
            month=month,
            settings=settings,
            client=client,
        )

        monthly_utci = kelvin_to_celsius(
            read_netcdf_series(monthly_asset, value_hints=("utci", "universal_thermal"))
        )
        reference_utci = kelvin_to_celsius(
            read_csv_series(reference_asset, value_hints=("utci", "universal_thermal"))
        )
        temperature = kelvin_to_celsius(
            read_csv_series(temperature_asset, value_hints=("2m_temperature", "t2m"))
        )
        result = compute_monthly_thermal(
            monthly_utci,
            temperature,
            reference_utci,
            year=year,
            month=month,
        )
        repository.upsert_monthly_thermal(
            point=point,
            year=year,
            month=month,
            result=result,
            product="ERA5-HEAT",
            product_version=f"{THERMAL_VERSION}-{product_type}",
        )
        total += 1
        logger.info(
            "Bilan thermique enregistré : point=%s période=%s-%02d statut=%s",
            point.slug,
            year,
            month,
            result.data_status,
        )
    return total


def run_job(job: str, settings: Settings) -> int:
    repository = Repository(settings.database_dsn)
    client = CopernicusClient(url=settings.cds_url, key=settings.cds_key)
    if job == JOB_CLIMATOLOGY:
        return run_climatology(settings, repository, client)
    if job == JOB_THERMAL:
        return run_monthly_thermal(settings, repository, client)
    raise ConfigurationError(f"RUN_ONLY inconnu : {job}")


def _next_daily_run(now: datetime) -> datetime:
    candidate = now.replace(hour=3, minute=20, second=0, microsecond=0)
    return candidate if candidate > now else candidate + timedelta(days=1)


def scheduled_loop(settings: Settings) -> None:
    while True:
        now = datetime.now()
        if now.day == 8:
            run_job(JOB_THERMAL, settings)
        if now.month == 1 and now.day == 9:
            run_job(JOB_CLIMATOLOGY, settings)
        next_run = _next_daily_run(datetime.now())
        logger.info("Planification Copernicus en attente : prochaine vérification=%s", next_run.isoformat())
        time.sleep(max(1, (next_run - datetime.now()).total_seconds()))


def main() -> int:
    try:
        settings = Settings.from_env()
        settings.download_dir.mkdir(parents=True, exist_ok=True)
        if os.getenv("RUN_ONCE", "true").lower() == "true":
            job = os.getenv("RUN_ONLY", JOB_THERMAL)
            count = run_job(job, settings)
            logger.info("Job Copernicus terminé : job=%s lignes=%s", job, count)
            return 0
        scheduled_loop(settings)
        return 0
    except (ConfigurationError, CopernicusDownloadError, ValueError) as exc:
        logger.error("%s", exc)
        return 1
    except Exception:
        # Ne pas journaliser l'exception brute : certains clients peuvent y inclure un
        # DSN ou des détails HTTP. Le diagnostic détaillé reste reproductible en local.
        logger.error("Échec Copernicus inattendu sans détail d'authentification")
        return 1


if __name__ == "__main__":
    sys.exit(main())
