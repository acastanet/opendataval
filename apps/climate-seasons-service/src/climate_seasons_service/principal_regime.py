from __future__ import annotations

import numpy as np

from .science import NOLEAP_DAYS, Crossings


def _threshold_interval_containing_peak(
    smoothed: np.ndarray,
    threshold: float,
    peak_index: int,
) -> tuple[float, float] | None:
    """Retourne les franchissements de l'intervalle >= seuil contenant le pic annuel."""

    values = np.asarray(smoothed, dtype=float)
    if values.ndim != 1 or values.size != NOLEAP_DAYS:
        raise ValueError("La série lissée doit contenir 365 valeurs")
    if not np.isfinite(values[peak_index]) or values[peak_index] < threshold:
        return None

    warm = np.isfinite(values) & (values >= threshold)
    if warm.all():
        return None

    start = peak_index
    while start > 0 and warm[start - 1]:
        start -= 1
    end = peak_index
    while end < NOLEAP_DAYS - 1 and warm[end + 1]:
        end += 1

    # Le candidat V3 exige un intervalle chaud principal entièrement contenu
    # dans l'année civile no-leap. Un intervalle qui touche une extrémité est
    # ambigu vis-à-vis de l'année précédente/suivante et n'est pas interprété.
    if start == 0 or end == NOLEAP_DAYS - 1:
        return None

    left_value = values[start - 1]
    first_value = values[start]
    last_value = values[end]
    right_value = values[end + 1]
    if not np.isfinite([left_value, first_value, last_value, right_value]).all():
        return None
    if first_value == left_value or right_value == last_value:
        return None

    ascending_fraction = (threshold - left_value) / (first_value - left_value)
    ascending = float(start + ascending_fraction)

    descending_fraction = (threshold - last_value) / (right_value - last_value)
    descending = float((end + 1) + descending_fraction)
    return ascending, descending


def detect_principal_regime_crossings(
    smoothed: np.ndarray,
    t25: float,
    t75: float,
) -> Crossings | None:
    """Détecte les quatre frontières T25/T75 autour du maximum annuel.

    Pour chaque seuil, le candidat V3 sélectionne l'intervalle continu supérieur
    ou égal au seuil qui contient le maximum thermique annuel. Il ne retient donc
    plus le premier franchissement rencontré chronologiquement dans l'année.
    """

    values = np.asarray(smoothed, dtype=float)
    if values.ndim != 1 or values.size != NOLEAP_DAYS:
        raise ValueError("La série lissée doit contenir 365 valeurs")
    if not np.isfinite(values).any():
        return None

    peak_index = int(np.nanargmax(values))
    t25_interval = _threshold_interval_containing_peak(values, t25, peak_index)
    t75_interval = _threshold_interval_containing_peak(values, t75, peak_index)
    if t25_interval is None or t75_interval is None:
        return None

    spring, winter = t25_interval
    summer, autumn = t75_interval
    if not (1.0 <= spring < summer < autumn < winter <= NOLEAP_DAYS):
        return None
    return Crossings(spring, summer, autumn, winter)
