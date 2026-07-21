-- Dates exactes associées aux trois niveaux de stress UTCI publiés.
-- Les tableaux restent vides jusqu'au prochain recalcul idempotent du mois.

alter table series.thermal_monthly
  add column dates_stress_fort date[] not null default '{}',
  add column dates_stress_tres_fort date[] not null default '{}',
  add column dates_stress_extreme date[] not null default '{}';
