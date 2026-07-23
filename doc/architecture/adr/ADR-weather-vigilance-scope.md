# ADR — Périmètre du microservice weather-vigilance

- Statut : accepté
- Date : 2026-07-23

## Décision

Le lot 4 est limité à la Vigilance météorologique officielle de Météo-France. Il expose les niveaux et phénomènes départementaux, les périodes aujourd'hui/demain, les chronologies disponibles, les bulletins, la provenance et l'état de fraîcheur.

Les données hydrologiques détaillées, la sécheresse et les risques d'incendie seront traités dans des microservices distincts. Aucun niveau global multi-risques ne sera calculé dans ce lot.

## Conséquences

Le gateway résout le département par le `geography-service` puis appelle `weather-vigilance-service`. Le service de vigilance n'effectue aucun géocodage et ne produit aucune estimation locale. Le phénomène `crues` du flux Vigilance est conservé sans intégrer Vigicrues.
