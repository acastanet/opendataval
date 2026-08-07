-- Index et journal des dalles OpenDataVdA (agent/mvp), lot P2 du backlog MVP.
-- La séquence porte le compteur NNNNNN de tile_id (ADR-007) : un compteur sur
-- système de fichiers ne serait pas sûr en écriture concurrente. Le manifeste
-- complet reste sur le volume `instances/` ; cette table n'en est que l'index.
create schema if not exists sites;

create sequence sites.tile_id_seq;

create table sites.instances (
  tile_id text primary key,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  title text,
  status text not null default 'created'
    check (status in ('created', 'collecting', 'generated', 'review_required', 'approved', 'published', 'failed')),
  review_status text not null default 'not_started'
    check (review_status in ('not_started', 'pending', 'approved', 'changes_requested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Journal de production (agent/mvp/04-SITE-SERVICE.md § « Journal de production »).
create table sites.evenements (
  id bigserial primary key,
  tile_id text not null references sites.instances (tile_id),
  etape text not null,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'succes', 'echec')),
  erreur text,
  demarre_a timestamptz not null default now(),
  termine_a timestamptz
);
create index evenements_tile_id_idx on sites.evenements (tile_id, demarre_a desc);
