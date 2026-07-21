-- Références climatiques ponctuelles ERA5-Land et bilans thermiques ERA5-HEAT.
-- Migration additive : les séries météo historiques existantes restent inchangées.

create table series.meteo_points_reference (
  id bigserial primary key,
  slug text not null unique,
  nom text not null,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  altitude_reference_m numeric,
  type_localisation text not null check (type_localisation in ('preconfiguree', 'precise')),
  actif boolean not null default true,
  maj timestamptz not null default now()
);

create unique index meteo_points_reference_coordonnees_type_uidx
  on series.meteo_points_reference (latitude, longitude, type_localisation);

create table series.meteo_climatologie_jour (
  point_id bigint not null references series.meteo_points_reference(id) on delete cascade,
  jour_annee smallint not null check (jour_annee between 1 and 366),
  periode_debut smallint not null,
  periode_fin smallint not null,
  fenetre_jours smallint not null check (fenetre_jours > 0 and fenetre_jours % 2 = 1),
  tmax_mediane numeric,
  tmax_p10 numeric,
  tmax_p90 numeric,
  tmin_mediane numeric,
  tmin_p10 numeric,
  tmin_p90 numeric,
  nb_valeurs integer not null check (nb_valeurs >= 0),
  completude_pct numeric(5, 2) not null check (completude_pct between 0 and 100),
  produit text not null,
  version_produit text not null,
  altitude_maille_m numeric,
  calcule_le timestamptz not null default now(),
  primary key (point_id, jour_annee, periode_debut, periode_fin, version_produit),
  check (periode_fin >= periode_debut)
);

create index meteo_climatologie_jour_recherche_idx
  on series.meteo_climatologie_jour (point_id, jour_annee, calcule_le desc);

create table series.thermal_monthly (
  point_id bigint not null references series.meteo_points_reference(id) on delete cascade,
  annee smallint not null,
  mois smallint not null check (mois between 1 and 12),
  utci_max_c numeric,
  categorie_max text,
  jours_stress_fort integer,
  jours_stress_tres_fort integer,
  jours_stress_extreme integer,
  nuits_tropicales integer,
  reference_jours_stress_fort numeric,
  anomalie_jours_stress_1991_2020 numeric,
  completude_pct numeric(5, 2) not null check (completude_pct between 0 and 100),
  statut_donnee text not null check (statut_donnee in ('complet', 'incomplet')),
  produit text not null,
  version_produit text not null,
  calcule_le timestamptz not null default now(),
  primary key (point_id, annee, mois, produit, version_produit)
);

create index thermal_monthly_publication_idx
  on series.thermal_monthly (point_id, statut_donnee, annee desc, mois desc);

insert into series.meteo_points_reference
  (slug, nom, latitude, longitude, type_localisation, actif)
values
  ('val-aigoual', 'Mairie de Val-d’Aigoual, Valleraugue', 44.081192, 3.641467, 'preconfiguree', true),
  ('paris', 'Paris, Hôtel de Ville', 48.856600, 2.352200, 'preconfiguree', true),
  ('marseille', 'Marseille, Hôtel de Ville', 43.296500, 5.369800, 'preconfiguree', true)
on conflict (slug) do update set
  nom = excluded.nom,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  type_localisation = excluded.type_localisation,
  actif = excluded.actif,
  maj = now();
