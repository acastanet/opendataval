-- Le niveau 1 du Gard est publié en BLANC sur la carte officielle
-- (risque-prevention-incendie.fr/gard/), pas en vert.
alter table incendies.risques_officiels drop constraint if exists risques_officiels_niveau_check;
update incendies.risques_officiels set niveau = 'blanc' where niveau = 'vert';
alter table incendies.risques_officiels
  add constraint risques_officiels_niveau_check
  check (niveau in ('blanc', 'jaune', 'orange', 'rouge', 'inconnu'));
