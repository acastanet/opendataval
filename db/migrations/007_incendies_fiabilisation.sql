-- Supprime les éventuelles observations importées dans la boîte englobante FIRMS
-- mais situées hors du véritable polygone de veille à 15 km.
delete from incendies.detections_firms as detection
using incendies.zones as veille
where veille.slug = 'veille_15km'
  and not ST_Covers(veille.geom, detection.geom);

create index if not exists detections_firms_position_observee_idx
  on incendies.detections_firms (position, observee_a desc);

create index if not exists risques_officiels_departement_validite_idx
  on incendies.risques_officiels (departement, date_validite desc);
