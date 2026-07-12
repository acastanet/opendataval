create extension if not exists postgis;

create schema if not exists territoire;
create schema if not exists couches;
create schema if not exists series;
create schema if not exists meta;

create table territoire.communes (
  code_insee text primary key,
  nom text not null,
  code_epci text,
  population integer,
  surface_ha numeric,
  est_epci_membre boolean not null default false,
  geom geometry(MultiPolygon, 4326),
  maj timestamptz not null default now()
);
create index communes_geom_idx on territoire.communes using gist (geom);

create table couches.objets (
  id bigserial primary key,
  couche text not null,
  external_id text not null,
  props jsonb not null default '{}'::jsonb,
  geom geometry(Geometry, 4326) not null,
  source_url text,
  maj timestamptz not null default now(),
  unique (couche, external_id)
);
create index objets_geom_idx on couches.objets using gist (geom);
create index objets_couche_idx on couches.objets (couche);

create table series.piezo (
  code_bss text not null,
  date date not null,
  niveau_m_ngf numeric,
  primary key (code_bss, date)
);

create table meta.sources (
  slug text primary key,
  nom text not null,
  url text,
  licence text,
  frequence text
);

create table meta.fetch_log (
  id bigserial primary key,
  source text not null,
  demarre_a timestamptz not null default now(),
  termine_a timestamptz,
  statut text not null default 'en_cours',
  nb_lignes integer,
  erreur text
);
create index fetch_log_source_idx on meta.fetch_log (source, demarre_a desc);
