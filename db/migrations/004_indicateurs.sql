-- Socle indicateurs : séries temporelles non cartographiques (INSEE, OFGL/DGFiP…).
-- Généralise le pattern météo (série -> endpoint -> île graphique). Le schéma `series`
-- existe déjà (001_init.sql). Migration purement additive.

create table series.indicateurs (
  indicateur text not null,   -- slug du registre (ex. 'population_municipale')
  territoire text not null,   -- code INSEE commune ou code EPCI
  periode    text not null,   -- '1968', '2022', '2022-T1' — format normalisé, tri lexicographique
  valeur     numeric,
  source     text not null,   -- slug SourceAmont
  maj        timestamptz not null default now(),
  primary key (indicateur, territoire, periode)
);
