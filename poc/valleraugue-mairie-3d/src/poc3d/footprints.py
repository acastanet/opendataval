"""Lecture des géométries CityJSONSeq partagée par le terrain et la scène GLB."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Iterator
import json


MINIMUM_LOD = 2.2
SUPPORTED_TYPES = {"Solid", "MultiSurface"}


def lod_value(geometry: dict) -> float:
    try:
        return float(geometry.get("lod", -1))
    except (TypeError, ValueError):
        return -1.0


def select_geometry(city_object: dict) -> dict | None:
    """Retourne la géométrie exploitable de plus haut niveau de détail."""
    supported = [
        geometry
        for geometry in city_object.get("geometry", [])
        if geometry.get("type") in SUPPORTED_TYPES
    ]
    return max(supported, key=lod_value) if supported else None


def geometry_faces(geometry: dict) -> Iterator[tuple[list[list[int]], str]]:
    """Parcourt les faces d'un Solid ou d'un MultiSurface avec leur sémantique."""
    surfaces = geometry.get("semantics", {}).get("surfaces", [])
    values = geometry.get("semantics", {}).get("values", [])

    def surface_type(semantic_index: object) -> str:
        if isinstance(semantic_index, int) and semantic_index < len(surfaces):
            return surfaces[semantic_index].get("type", "")
        return ""

    boundaries = geometry.get("boundaries", [])
    if geometry.get("type") == "Solid":
        for shell_index, faces in enumerate(boundaries):
            face_values = values[shell_index] if shell_index < len(values) else []
            for face_index, rings in enumerate(faces):
                semantic = face_values[face_index] if face_index < len(face_values) else None
                yield rings, surface_type(semantic)
    else:
        for face_index, rings in enumerate(boundaries):
            semantic = values[face_index] if face_index < len(values) else None
            yield rings, surface_type(semantic)


def iter_ground_footprints(
    paths: Iterable[Path],
) -> Iterator[tuple[list[tuple[float, float]], float]]:
    """Produit les emprises au sol en Lambert-93 avec l'altitude de leur base.

    Chaque bâtiment reconstruit par Roofer repose sur un plan horizontal ; l'altitude
    retournée est celle de ce plan, utilisée pour asseoir le terrain sous le bâtiment.
    """
    for path in paths:
        with path.open(encoding="utf-8") as stream:
            try:
                header = json.loads(next(stream))
            except StopIteration:
                continue
            scale = header["transform"]["scale"]
            translate = header["transform"]["translate"]
            for line in stream:
                if not line.strip():
                    continue
                feature = json.loads(line)
                vertices = [
                    (
                        raw[0] * scale[0] + translate[0],
                        raw[1] * scale[1] + translate[1],
                        raw[2] * scale[2] + translate[2],
                    )
                    for raw in feature.get("vertices", [])
                ]
                if not vertices:
                    continue
                for city_object in feature.get("CityObjects", {}).values():
                    geometry = select_geometry(city_object)
                    if geometry is None or lod_value(geometry) < MINIMUM_LOD:
                        continue
                    for rings, surface in geometry_faces(geometry):
                        if surface != "GroundSurface" or not rings or len(rings[0]) < 3:
                            continue
                        polygon = [(vertices[index][0], vertices[index][1]) for index in rings[0]]
                        elevation = min(vertices[index][2] for index in rings[0])
                        yield polygon, elevation
