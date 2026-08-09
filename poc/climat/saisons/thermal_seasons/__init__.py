"""Saisons thermiques locales — « Les saisons se déplacent » (V1).

Package autonome réutilisant le pipeline Copernicus existant
(poc/climat/empreinte-climatique) pour le téléchargement et la lecture
des séries ERA5-Land. La présente V1 calcule les saisons thermiques T25/T75
définies par Wang et al. (2021) et leur déplacement entre 1996–2005 et
2016–2025.
"""

from .schema import SCHEMA_VERSION

__version__ = "1.0.0"
__all__ = ["SCHEMA_VERSION"]
