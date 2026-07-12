create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace view couches.lieux_recherche as
  select 'commune' as type, 'commune' as couche, nom, null::text as sous_label,
         ST_PointOnSurface(geom) as pt
  from territoire.communes
  union all
  select 'lieu', couche,
         coalesce(props->>'nom', props->>'lieu') as nom,
         props->>'commune' as sous_label,
         ST_PointOnSurface(geom)
  from couches.objets
  where coalesce(props->>'nom', props->>'lieu') is not null;
