create schema if not exists incendies;

create table incendies.zones (
  slug text primary key,
  nom text not null,
  type_zone text not null check (type_zone in ('coeur', 'proche_5km', 'veille_15km', 'officielle')),
  source text not null,
  version_source text,
  geom geometry(MultiPolygon, 4326) not null,
  maj timestamptz not null default now()
);
create index incendies_zones_geom_idx on incendies.zones using gist (geom);

create table incendies.detections_firms (
  id bigserial primary key,
  external_id text not null unique,
  observee_a timestamptz not null,
  satellite text not null,
  instrument text not null,
  confiance text,
  frp numeric,
  jour_nuit text check (jour_nuit in ('D', 'N')),
  position text not null check (position in ('coeur', 'proche', 'veille')),
  distance_coeur_m numeric not null check (distance_coeur_m >= 0),
  geom geometry(Point, 4326) not null,
  collectee_a timestamptz not null default now()
);
create index detections_firms_geom_idx on incendies.detections_firms using gist (geom);
create index detections_firms_observee_a_idx on incendies.detections_firms (observee_a desc);

create table incendies.risques_officiels (
  id bigserial primary key,
  date_validite date not null,
  collectee_a timestamptz not null default now(),
  departement text not null,
  zone_officielle text not null,
  niveau text not null check (niveau in ('vert', 'jaune', 'orange', 'rouge', 'inconnu')),
  restrictions text,
  source_url text not null,
  archive_brute text,
  unique (date_validite, departement, zone_officielle)
);
create index risques_officiels_validite_idx on incendies.risques_officiels (date_validite desc, collectee_a desc);
