-- Distingue les publications récupérées automatiquement des fichiers de secours
-- vérifiés puis déposés manuellement par l'exploitant.
alter table incendies.risques_officiels
  add column if not exists mode_collecte text not null default 'automatique'
  check (mode_collecte in ('automatique', 'manuel'));
