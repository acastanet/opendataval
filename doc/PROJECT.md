# PROJECT.md
> **Vision Fonctionnelle** — Portail OpenData Val-d'Aigoual & CC Causses Aigoual Cévennes
> Version 1.0 — 2026-07-10

---

## 🎯 MISSION

**Construire un portail territorial open data qui agrège, documente et valorise toutes les données publiques du territoire de Val-d'Aigoual et de son EPCI.**

---

## 📍 CONTEXTE

### Le problème
- Les données publiques existent mais sont **dispersées** sur de multiples plateformes
- Aucune **vision unifiée** du territoire n'existe
- Les citoyens, touristes et décideurs locaux ne peuvent pas **facilement accéder** à ces informations
- Le territoire a un **patrimoine exceptionnel** (Mont Aigoual, Parc National des Cévennes) qui mérite d'être mis en valeur

### La solution
Un **portail unique** qui combine :
- Présentation éditoriale
- Tableaux de bord chiffrés
- Explorateur cartographique interactif

---

## 👥 UTILISATEURS CIBLES

| Utilisateur | Besoins | Priorité |
|---|---|---|
| **Habitants** | Accéder aux services, comprendre leur territoire | ⭐⭐⭐ |
| **Touristes** | Découvrir les attraits, randonnées, hébergements | ⭐⭐⭐ |
| **Élus locaux** | Suivre les indicateurs, prendre des décisions | ⭐⭐⭐ |
| **Agents territoriaux** | Accéder aux données pour leur travail | ⭐⭐ |
| **Journalistes/chercheurs** | Accéder aux données brutes et analyses | ⭐ |
| **Développeurs** | Accéder aux API et données ouvertes | ⭐ |

---

## 🗺️ TERRITOIRE COUVERT

### Commune principale
- **Nom** : Val-d'Aigoual
- **Code INSEE** : 30339
- **SIREN** : 200082725
- **Population** : 1 412 (municipale) / 1 418 (2022 INSEE)
- **Superficie** : 9 561,82 ha (≈ 95,6 km²)
- **Coordonnées** : Centroïde 3.6272°E / 44.081°N

### EPCI (Intercommunalité)
- **Nom** : CC Causses Aigoual Cévennes – Terres Solidaires
- **SIREN/Code** : 200034601
- **Population** : 5 391 habitants
- **15 communes membres** : Causse-Bégon, Dourbies, L'Estréchure, Lanuéjols, Lasalle, Peyrolles-en-Cévennes, Les Plantiers, Revens, Saint-André-de-Majencoules, Saint-André-de-Valborgne, Saint-Sauveur-Camprieu, Saumane, Soudorgues, Trèves, **Val-d'Aigoual**

### Points d'intérêt majeurs
- **Mont Aigoual** : Sommet à 44.1216°N / 3.5814°E, altitude ≈ 1567 m
- **Station météo** : NUM_POSTE 30339001 (SYNOP/OMM 07560)
- **Parc National** : Cœur du Parc National des Cévennes

---

## ✅ FONCTIONNALITÉS PRINCIPALES

### 1. Carte Interactive (Priorité Max)
- Fond de carte IGN (PLANIGNV2 / ORTHOPHOTOS)
- Contour de la commune et des 15 communes de l'EPCI
- Couches thématiques : Natura 2000, ZNIEFF, Parc National, stations Hub'Eau, sentiers, POI OSM
- Relief 3D (via MapLibre GL JS)
- Recherche d'adresses (Base Adresse Nationale)

### 2. Tableaux de bord
- Chiffres clés du territoire
- Indicateurs socio-économiques (population, établissements, finances)
- Indicateurs environnementaux (météo, qualité de l'air, risques)
- Séries temporelles pour les données historiques

### 3. Explorateur de données
- Catalogue complet des sources
- Filtres par thème, territoire, fréquence de mise à jour
- Téléchargement des données brutes (JSON, CSV, GeoJSON)
- Attributions et licences claires

### 4. Pages thématiques (14 domaines)
1. **Accueil** — Carte + chiffres clés + météo du jour
2. **Territoire** — Identité, 15 communes, cadastre, urbanisme
3. **Population & Société** — Démographie, logement, emploi, revenus
4. **Économie & Agriculture** — Établissements, équipements, AOP/IGP, RPG
5. **Finances publiques** — OFGL, balances comptables, marchés publics
6. **Géographie & Relief** — Altimétrie, hydrographie, fonds IGN
7. **Météo & Climat** — Normales, séries historiques, obs temps réel, vigilance
8. **Environnement & Biodiversité** — Natura 2000, ZNIEFF, cœur PNC, qualité de l'air, eau
9. **Risques** — Inondation, feu de forêt, radon, mouvements de terrain, sismique
10. **Services & Vie pratique** — Mairie, écoles, santé, associations
11. **Tourisme & Randonnée** — DATAtourisme, sentiers GR/PR, POI OSM
12. **Mobilité** — Réseau liO (GTFS)
13. **Vie démocratique** — Résultats électoraux, élus (RNE)
14. **Sources & Open Data** — Catalogue, licences, méthodologie

---

## 🚫 HORS PÉRIMÈTRE

| Élément | Justification |
|---|---|
| Fonctionnalités SIG avancées | Complexité non nécessaire pour le public cible |
| CMS généraliste | Le focus est sur les données, pas sur le contenu éditorial |
| Plateforme Big Data | Volume de données gérable avec PostgreSQL/PostGIS |
| Authentification utilisateur | Toutes les données sont publiques (Licence Ouverte / ODbL) |
| Modification des données en ligne | Les données proviennent de sources officielles externes |
| Multi-territoires (pour l'instant) | Focus sur Val-d'Aigoual + EPCI, extensible plus tard |

---

## 📊 OBJECTIFS QUANTITATIFS

| Métrique | Cible | Échéance |
|---|---|---|
| Sources de données intégrées | 17/17 | Brique 1 |
| Pages thématiques opérationnelles | 14/14 | Brique 5 |
| Couches cartographiques | 20+ | Brique 1 |
| Temps de chargement (homepage) | < 2s | Tout le temps |
| Score Lighthouse (Perf) | > 80 | Tout le temps |
| Score Lighthouse (Accessibilité) | > 90 | Tout le temps |
| Couverture de tests | > 70% | Brique 1 |

---

## 🎨 EXPÉRIENCE UTILISATEUR

### Principes
- **Simple** : Accès immédiat à l'information
- **Intuitif** : Navigation claire et naturelle
- **Rapide** : Pas d'attente inutile
- **Accessible** : Respect RGAA AA minimum
- **Responsive** : Fonctionne sur mobile, tablette, desktop

### Personas

**Jean, habitant** : "Je veux savoir quels sont les risques naturels dans ma commune"
→ Accès direct via la carte ou la page Risques

**Marie, touriste** : "Je veux trouver une randonnée autour du Mont Aigoual"
→ Carte interactive avec filtre sentiers + POI

**Pierre, élu** : "Je veux voir l'évolution démographique de mon EPCI"
→ Tableaux de bord avec graphiques et données brutes

---

## 🔄 ÉVOLUTIONS FUTURES (Post-MVP)

| Évolution | Description | Priorité |
|---|---|---|
| Multi-territoires | Réutilisation par d'autres communes | Moyenne |
| Comparaison entre territoires | Benchmarking | Basse |
| Alertes personnalisées | Notifications par email | Basse |
| Contributions utilisateurs | Signalement d'erreurs | Basse |
| API publique | Pour les développeurs externes | Moyenne |

---

## 📝 RÉFÉRENCES

- **Plan détaillé** : [plan-vision-globale.md](./plan-vision-globale.md)
- **MVP Brique 1** : [plan-brique-1-mvp.md](./plan-brique-1-mvp.md)
- **Architecture** : Voir [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Décisions** : Voir [DECISIONS.md](./DECISIONS.md)

---

> **Document maintenu par** : Architecte (vous)
> **Dernière mise à jour** : 2026-07-10
> **Version** : 1.0