"""Triangulation de polygones CityJSON, y compris leurs anneaux intérieurs."""

from __future__ import annotations

import math


Point3 = tuple[float, float, float]
Point2 = tuple[float, float]


def _normal(points: list[Point3], ring: list[int]) -> Point3:
    nx = ny = nz = 0.0
    for current, following in zip(ring, ring[1:] + ring[:1]):
        ax, ay, az = points[current]
        bx, by, bz = points[following]
        nx += (ay - by) * (az + bz)
        ny += (az - bz) * (ax + bx)
        nz += (ax - bx) * (ay + by)
    return nx, ny, nz


def _project(points: list[Point3], ring: list[int], indices: set[int]) -> dict[int, Point2]:
    normal = _normal(points, ring)
    axis = max(range(3), key=lambda index: abs(normal[index]))
    if axis == 0:
        return {index: (points[index][1], points[index][2]) for index in indices}
    if axis == 1:
        return {index: (points[index][0], points[index][2]) for index in indices}
    return {index: (points[index][0], points[index][1]) for index in indices}


def _area(ring: list[int], coordinates: dict[int, Point2]) -> float:
    return sum(
        coordinates[current][0] * coordinates[following][1]
        - coordinates[following][0] * coordinates[current][1]
        for current, following in zip(ring, ring[1:] + ring[:1])
    )


def _cross(a: Point2, b: Point2, c: Point2) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a: Point2, b: Point2, point: Point2) -> bool:
    return (
        min(a[0], b[0]) - 1e-10 <= point[0] <= max(a[0], b[0]) + 1e-10
        and min(a[1], b[1]) - 1e-10 <= point[1] <= max(a[1], b[1]) + 1e-10
        and abs(_cross(a, b, point)) <= 1e-10
    )


def _segments_intersect(a: Point2, b: Point2, c: Point2, d: Point2) -> bool:
    ab_c, ab_d = _cross(a, b, c), _cross(a, b, d)
    cd_a, cd_b = _cross(c, d, a), _cross(c, d, b)
    if (ab_c > 1e-10 and ab_d < -1e-10 or ab_c < -1e-10 and ab_d > 1e-10) and (
        cd_a > 1e-10 and cd_b < -1e-10 or cd_a < -1e-10 and cd_b > 1e-10
    ):
        return True
    return any((_on_segment(a, b, c), _on_segment(a, b, d), _on_segment(c, d, a), _on_segment(c, d, b)))


def _point_in_triangle(point: Point2, a: Point2, b: Point2, c: Point2) -> bool:
    signs = (_cross(a, b, point), _cross(b, c, point), _cross(c, a, point))
    return min(signs) >= -1e-10 or max(signs) <= 1e-10


def _clean(ring: list[int]) -> list[int]:
    result: list[int] = []
    for index in ring:
        if not result or result[-1] != index:
            result.append(index)
    if len(result) > 1 and result[0] == result[-1]:
        result.pop()
    return result


def _visible_bridge(hole: list[int], outer: list[int], coordinates: dict[int, Point2]) -> tuple[int, int]:
    hole_position = max(range(len(hole)), key=lambda index: (coordinates[hole[index]][0], -coordinates[hole[index]][1]))
    hole_index = hole[hole_position]
    candidates = sorted(
        range(len(outer)),
        key=lambda index: (coordinates[outer[index]][0] - coordinates[hole_index][0]) ** 2
        + (coordinates[outer[index]][1] - coordinates[hole_index][1]) ** 2,
    )
    edges = list(zip(outer, outer[1:] + outer[:1])) + list(zip(hole, hole[1:] + hole[:1]))
    for outer_position in candidates:
        outer_index = outer[outer_position]
        if outer_index == hole_index:
            continue
        if any(
            _segments_intersect(coordinates[hole_index], coordinates[outer_index], coordinates[start], coordinates[end])
            for start, end in edges
            if hole_index not in (start, end) and outer_index not in (start, end)
        ):
            continue
        return hole_position, outer_position
    raise ValueError("Impossible de relier un anneau intérieur")


def _merge_hole(hole: list[int], outer: list[int], coordinates: dict[int, Point2]) -> list[int]:
    hole_position, outer_position = _visible_bridge(hole, outer, coordinates)
    rotated_hole = hole[hole_position:] + hole[:hole_position]
    # Les sommets du pont sont volontairement dupliqués : le chemin devient simple.
    return outer[: outer_position + 1] + rotated_hole + [rotated_hole[0], outer[outer_position]] + outer[outer_position + 1 :]


def is_convex(points: list[Point3], ring: list[int]) -> bool:
    """Indique si un contour est convexe, seul cas où un éventail naïf reste correct."""
    cleaned = _clean(ring)
    if len(cleaned) < 3:
        return False
    coordinates = _project(points, cleaned, set(cleaned))
    area = _area(cleaned, coordinates)
    if abs(area) <= 1e-10:
        return False
    winding = 1 if area > 0 else -1
    for position, current in enumerate(cleaned):
        previous = cleaned[position - 1]
        following = cleaned[(position + 1) % len(cleaned)]
        turn = _cross(coordinates[previous], coordinates[current], coordinates[following])
        if turn * winding < -1e-10:
            return False
    return True


def triangulate(points: list[Point3], rings: list[list[int]]) -> list[tuple[int, int, int]]:
    """Retourne des triangles orientés comme l'anneau extérieur.

    La fonction lève ``ValueError`` pour les géométries dégénérées ; l'appelant peut alors
    choisir une stratégie de repli sans perdre toute la face.
    """
    cleaned = [_clean(ring) for ring in rings]
    if not cleaned or len(cleaned[0]) < 3:
        raise ValueError("Anneau extérieur dégénéré")
    if any(index < 0 or index >= len(points) for ring in cleaned for index in ring):
        raise ValueError("Indice de sommet invalide")
    coordinates = _project(points, cleaned[0], {index for ring in cleaned for index in ring})
    if abs(_area(cleaned[0], coordinates)) <= 1e-10:
        raise ValueError("Face sans surface")
    outer = cleaned[0]
    winding = 1 if _area(outer, coordinates) > 0 else -1
    for hole in cleaned[1:]:
        if len(hole) < 3:
            continue
        if _area(hole, coordinates) * winding > 0:
            hole = list(reversed(hole))
        outer = _merge_hole(hole, outer, coordinates)

    vertices = outer[:]
    triangles: list[tuple[int, int, int]] = []
    guard = len(vertices) * len(vertices)
    while len(vertices) > 3 and guard:
        guard -= 1
        clipped = False
        for position, current in enumerate(vertices):
            previous = vertices[position - 1]
            following = vertices[(position + 1) % len(vertices)]
            turn = _cross(coordinates[previous], coordinates[current], coordinates[following]) * winding
            if turn <= 1e-10:
                continue
            if any(
                other not in (previous, current, following)
                and _point_in_triangle(coordinates[other], coordinates[previous], coordinates[current], coordinates[following])
                for other in vertices
            ):
                continue
            triangles.append((previous, current, following))
            vertices.pop(position)
            clipped = True
            break
        if not clipped:
            raise ValueError("Découpage d'oreilles impossible")
    if len(vertices) != 3:
        raise ValueError("Face non triangulable")
    triangles.append((vertices[0], vertices[1], vertices[2]))
    return triangles
