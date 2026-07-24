# ADR — Détection incendie stateless et séparation des sources

- Statut : accepté
- Date : 2026-07-24
- Lot : 5

## Décision

Le service de détection incendie est autonome et sans base de données.

- EUMETSAT MTG et MSG alimentent la fonction de suspicions récentes ;
- NASA FIRMS Area API alimente également les suspicions récentes ;
- la dernière suspicion dans un rayon de 50 km est calculée exclusivement à partir de NASA FIRMS Area API ;
- le gateway impose un rayon de 50 km et sept jours d'historique ;
- les détections de confiance faible ne sont pas filtrées par OpenDataVal ;
- l'indisponibilité d'une source reste distincte d'une réponse vide ;
- le vocabulaire public parle de suspicion ou d'anomalie thermique, jamais de feu confirmé.

## Conséquences

Le service peut être déplacé ou redémarré sans migration de données. Il dépend toutefois de la disponibilité des fournisseurs à chaque requête et ne peut produire un historique si FIRMS est indisponible.
