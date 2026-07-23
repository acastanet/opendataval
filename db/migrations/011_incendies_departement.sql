-- Élargit le périmètre incendies au département du Gard entier (au-delà des
-- 3 massifs de l'Aigoual et de la zone de veille de 15 km), pour la page
-- vigilance-feu qui géolocalise l'utilisateur n'importe où dans le Gard.
alter table incendies.zones drop constraint zones_type_zone_check;
alter table incendies.zones
  add constraint zones_type_zone_check
  check (type_zone in ('coeur', 'proche_5km', 'veille_15km', 'departement', 'officielle'));

alter table incendies.detections_firms drop constraint detections_firms_position_check;
alter table incendies.detections_firms
  add constraint detections_firms_position_check
  check (position in ('coeur', 'proche', 'veille', 'departement'));
