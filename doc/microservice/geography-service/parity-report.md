# Rapport de parité — Lot 2

Le corpus versionné dans `geography-reference-corpus.json` couvre Val-d’Aigoual, sommet, villes, rural, limite administrative, Gard hors commune, zone isolée, mer, invalides et indisponibilité simulée.

Le chemin historique (`apps/api/src/lib/geography.ts`) ne publie ni adresse structurée, ni EPCI, ni distance, ni métadonnées altimétriques ; la parité stricte de ces champs est donc non applicable. Les divergences attendues sont documentées : le nouveau service distingue `not_found`, `unavailable` et `timeout`, expose l'adresse comme estimation, et ajoute l'EPCI depuis l'API administrative. Les campagnes réelles doivent être exécutées après déploiement interne, sans conservation de coordonnées en production.
