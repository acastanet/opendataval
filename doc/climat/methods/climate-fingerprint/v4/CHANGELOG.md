# Changelog — Climate Fingerprint V4

## 4.0.0 — extraction canonique P2

Statut : `draft`.

Cette version ne modifie pas encore le code du POC. Elle formalise comme méthode canonique le comportement V4 actuellement implémenté.

### Figé

- référence climatologique 1991–2020 ;
- période visible 1996–2025 ;
- comparaison 1996–2005 / 2016–2025 ;
- six métriques : température, UTCI, précipitations, pluies intenses, sécheresse, vent ;
- seuils de classification P10 / P33,3 / P66,6 / P90 ;
- normalisation graphique robuste V4 et accentuation gamma comme choix éditorial ;
- détection automatique de candidats événements ;
- règles minimales de complétude actuellement appliquées par le POC.

### Décisions P2

- la source canonique du vent devient explicitement **ERA5-Land time-series**, conformément au fetch et au build V4 ;
- la ligne « pluies intenses » est nommée comme un **compte annuel de jours au-dessus du P95 des jours humides de référence** et non comme R95p/R95pTOT ;
- la couleur V4 est explicitement classée comme restitution éditoriale OpenDataVal et non comme indice scientifique autonome ;
- le résumé textuel déterministe actuel est classé comme logique de restitution legacy appelée à être remplacée par `climate-commentary-service`.

### À résoudre avant `validated`

- P3 : règles d'interprétation ;
- P4 : contrat commun `ClimateResult` / `ClimateSignal` ;
- P5 : équivalence avec le golden master V4 ;
- migration de l'acquisition vers un actif ERA5-Land approprié à la production, sans dépendance obligatoire à l'interface time-series signalée par ECMWF comme non recommandée en production ;
- méthode de quantile explicitement figée ;
- contrôle de complétude horaire avant agrégation quotidienne.
