# ADR — Périmètre du microservice de vigilance météorologique

- Statut : accepté
- Date : 2026-07-23
- Lot : 4

## Décision

Le lot 4 est limité à la Vigilance météorologique officielle. Les données hydrologiques détaillées, la sécheresse et les risques d'incendie seront traités dans des microservices distincts. Aucun niveau global multi-risques ne sera calculé dans ce lot.

Le service reçoit un code département fourni directement ou résolu par `geography-service`. Il n'effectue ni géocodage, ni estimation locale, ni calcul météorologique.

## Conséquences

- le phénomène `crues` relayé par la Vigilance est conservé ;
- Vigicrues, Vigicrues Flash, APIC, VigiEau, sécheresse et incendies restent exclus ;
- une vigilance départementale ne doit jamais être présentée comme un phénomène présent aux coordonnées de l'utilisateur ;
- l'absence de donnée, l'expiration et la vigilance verte restent des états distincts ;
- les bulletins sont conservés sans résumé ni réécriture.
