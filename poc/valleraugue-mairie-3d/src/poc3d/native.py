from __future__ import annotations

from importlib import import_module
from pathlib import Path
import sys

from .config import PocConfig, latest_run


# `shapefile` est le nom d'import de pyshp : sans lui ici, une installation incomplète ne se
# manifesterait qu'au milieu de l'étape `geology`, après le téléchargement de l'archive.
REQUIRED_MODULES = ("laspy", "numpy", "PIL", "shapefile", "scipy", "skimage")

# Ces quatre-là embarquent chacun leur propre copie de GDAL, GEOS ou PROJ dans leur roue
# Windows. Des versions divergentes ne produisent pas de message clair : le premier `import`
# échoue sur une DLL introuvable, au milieu d'une étape et non au démarrage. Les importer
# ensemble ici est le seul contrôle qui attrape cela avant qu'il ne coûte une exécution.
GEOSPATIAL_MODULES = ("shapely", "pyproj", "geopandas", "rasterio")


def check_environment(config: PocConfig) -> Path:
    config.validate()
    if sys.version_info < (3, 11):
        raise RuntimeError("Python 3.11 ou supérieur est requis")
    versions: list[str] = []
    for name in (*REQUIRED_MODULES, *GEOSPATIAL_MODULES):
        try:
            module = import_module(name)
        except ImportError as error:
            raise RuntimeError(
                f"Module Python absent : {name}. "
                "Installer avec : python -m pip install -r requirements.txt"
            ) from error
        versions.append(f"{name}={getattr(module, '__version__', 'présent')}")

    run_dir = latest_run(config, require_complete=True)
    lidar = run_dir / "lidar_subset.laz"
    cityjson = sorted((run_dir / "roofer_output").glob("*.city.jsonl"))
    if not lidar.is_file() or lidar.stat().st_size == 0:
        raise FileNotFoundError(f"Entrée LiDAR absente : {lidar}")
    if not cityjson:
        raise FileNotFoundError(f"Entrée CityJSONSeq absente : {run_dir / 'roofer_output'}")
    from .web import viewer_is_stale

    stale_viewer = viewer_is_stale(config, run_dir / "web")
    if stale_viewer:
        print(
            "AVERTISSEMENT : visualiseur web absent ou périmé "
            f"({', '.join(stale_viewer)}). Exécuter `poc.py web` avant de servir."
        )
    print(f"Python Windows prêt : {', '.join(versions)}")
    print(f"Entrées : {run_dir}")
    return run_dir
