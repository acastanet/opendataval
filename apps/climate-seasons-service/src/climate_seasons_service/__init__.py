from .compute import ThermalSeasonsContext, ThermalSeasonsInput, compute_thermal_seasons_data
from .equivalence import assert_thermal_seasons_equivalent, comparable_payload
from .renderer import (
    ThermalSeasonsRenderError,
    render_thermal_seasons_result_svg,
    render_thermal_seasons_svg,
    write_thermal_seasons_result_svg,
)
from .request import GridPoint, nearest_grid_point, request_parameters
from .result import ResultContext, build_climate_result
from .signals import build_signals
from .snapshot import (
    SnapshotError,
    SnapshotIntegrityError,
    build_snapshot_manifest,
    read_temperature,
    replay_snapshot,
    sha256_file,
    verify_snapshot_asset,
    write_snapshot_manifest,
)
from .v2 import METHOD_V2, build_climate_result_v2, build_v2_signals, compute_thermal_seasons_v2_data
from .v3 import METHOD_V3, build_climate_result_v3, build_v3_signals, compute_thermal_seasons_v3_data
from .v4 import METHOD_V4, build_climate_result_v4, build_v4_signals, compute_thermal_seasons_v4_data
from .validate import resolve_json_pointer, validate_result_invariants

__all__ = [
    "ThermalSeasonsContext",
    "ThermalSeasonsInput",
    "compute_thermal_seasons_data",
    "ResultContext",
    "build_climate_result",
    "build_signals",
    "METHOD_V2",
    "compute_thermal_seasons_v2_data",
    "build_climate_result_v2",
    "build_v2_signals",
    "METHOD_V3",
    "compute_thermal_seasons_v3_data",
    "build_climate_result_v3",
    "build_v3_signals",
    "METHOD_V4",
    "compute_thermal_seasons_v4_data",
    "build_climate_result_v4",
    "build_v4_signals",
    "assert_thermal_seasons_equivalent",
    "comparable_payload",
    "ThermalSeasonsRenderError",
    "render_thermal_seasons_svg",
    "render_thermal_seasons_result_svg",
    "write_thermal_seasons_result_svg",
    "GridPoint",
    "nearest_grid_point",
    "request_parameters",
    "SnapshotError",
    "SnapshotIntegrityError",
    "build_snapshot_manifest",
    "read_temperature",
    "replay_snapshot",
    "sha256_file",
    "verify_snapshot_asset",
    "write_snapshot_manifest",
    "resolve_json_pointer",
    "validate_result_invariants",
]
