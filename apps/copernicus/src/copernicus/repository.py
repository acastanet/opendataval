from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.rows import dict_row

from .process.climatology import ClimatologyRow, REFERENCE_END, REFERENCE_START, WINDOW_DAYS
from .process.monthly_thermal import MonthlyThermalResult


@dataclass(frozen=True)
class ReferencePoint:
    id: int
    slug: str
    name: str
    latitude: float
    longitude: float


class Repository:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def points(self) -> list[ReferencePoint]:
        with psycopg.connect(self._dsn, row_factory=dict_row) as connection:
            rows = connection.execute(
                """select id, slug, nom, latitude, longitude
                   from series.meteo_points_reference
                   where actif
                   order by id"""
            ).fetchall()
        return [
            ReferencePoint(
                id=int(row["id"]),
                slug=str(row["slug"]),
                name=str(row["nom"]),
                latitude=float(row["latitude"]),
                longitude=float(row["longitude"]),
            )
            for row in rows
        ]

    def upsert_climatology(
        self,
        *,
        point: ReferencePoint,
        rows: list[ClimatologyRow],
        product: str,
        product_version: str,
        grid_altitude_m: float | None = None,
    ) -> int:
        if not rows:
            return 0
        statement = """
            insert into series.meteo_climatologie_jour (
              point_id, jour_annee, periode_debut, periode_fin, fenetre_jours,
              tmax_mediane, tmax_p10, tmax_p90, tmin_mediane, tmin_p10, tmin_p90,
              nb_valeurs, completude_pct, produit, version_produit, altitude_maille_m, calcule_le
            ) values (
              %(point_id)s, %(day)s, %(start)s, %(end)s, %(window)s,
              %(tmax_median)s, %(tmax_p10)s, %(tmax_p90)s,
              %(tmin_median)s, %(tmin_p10)s, %(tmin_p90)s,
              %(count)s, %(completeness)s, %(product)s, %(version)s, %(altitude)s, now()
            )
            on conflict (point_id, jour_annee, periode_debut, periode_fin, version_produit)
            do update set
              fenetre_jours = excluded.fenetre_jours,
              tmax_mediane = excluded.tmax_mediane,
              tmax_p10 = excluded.tmax_p10,
              tmax_p90 = excluded.tmax_p90,
              tmin_mediane = excluded.tmin_mediane,
              tmin_p10 = excluded.tmin_p10,
              tmin_p90 = excluded.tmin_p90,
              nb_valeurs = excluded.nb_valeurs,
              completude_pct = excluded.completude_pct,
              produit = excluded.produit,
              altitude_maille_m = excluded.altitude_maille_m,
              calcule_le = now()
        """
        parameters = [
            {
                "point_id": point.id,
                "day": row.day_of_year,
                "start": REFERENCE_START,
                "end": REFERENCE_END,
                "window": WINDOW_DAYS,
                "tmax_median": row.tmax_median,
                "tmax_p10": row.tmax_p10,
                "tmax_p90": row.tmax_p90,
                "tmin_median": row.tmin_median,
                "tmin_p10": row.tmin_p10,
                "tmin_p90": row.tmin_p90,
                "count": row.value_count,
                "completeness": row.completeness_pct,
                "product": product,
                "version": product_version,
                "altitude": grid_altitude_m,
            }
            for row in rows
        ]
        with psycopg.connect(self._dsn) as connection:
            with connection.cursor() as cursor:
                cursor.executemany(statement, parameters)
            connection.commit()
        return len(rows)

    def upsert_monthly_thermal(
        self,
        *,
        point: ReferencePoint,
        year: int,
        month: int,
        result: MonthlyThermalResult,
        product: str,
        product_version: str,
    ) -> None:
        with psycopg.connect(self._dsn) as connection:
            connection.execute(
                """
                insert into series.thermal_monthly (
                  point_id, annee, mois, utci_max_c, categorie_max,
                  jours_stress_fort, jours_stress_tres_fort, jours_stress_extreme,
                  dates_stress_fort, dates_stress_tres_fort, dates_stress_extreme,
                  nuits_tropicales, reference_jours_stress_fort,
                  anomalie_jours_stress_1991_2020, completude_pct, statut_donnee,
                  produit, version_produit, calcule_le
                ) values (
                  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now()
                )
                on conflict (point_id, annee, mois, produit, version_produit)
                do update set
                  utci_max_c = excluded.utci_max_c,
                  categorie_max = excluded.categorie_max,
                  jours_stress_fort = excluded.jours_stress_fort,
                  jours_stress_tres_fort = excluded.jours_stress_tres_fort,
                  jours_stress_extreme = excluded.jours_stress_extreme,
                  dates_stress_fort = excluded.dates_stress_fort,
                  dates_stress_tres_fort = excluded.dates_stress_tres_fort,
                  dates_stress_extreme = excluded.dates_stress_extreme,
                  nuits_tropicales = excluded.nuits_tropicales,
                  reference_jours_stress_fort = excluded.reference_jours_stress_fort,
                  anomalie_jours_stress_1991_2020 = excluded.anomalie_jours_stress_1991_2020,
                  completude_pct = excluded.completude_pct,
                  statut_donnee = excluded.statut_donnee,
                  calcule_le = now()
                """,
                (
                    point.id,
                    year,
                    month,
                    result.utci_max_c,
                    result.max_category,
                    result.strong_stress_days,
                    result.very_strong_stress_days,
                    result.extreme_stress_days,
                    list(result.strong_stress_dates),
                    list(result.very_strong_stress_dates),
                    list(result.extreme_stress_dates),
                    result.tropical_nights,
                    result.reference_strong_stress_days,
                    result.strong_stress_anomaly,
                    result.completeness_pct,
                    result.data_status,
                    product,
                    product_version,
                ),
            )
            connection.commit()
