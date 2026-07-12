# Plan — Portail Open Data : Val-d'Aigoual & CC Causses Aigoual Cevennes
## Version 2 — Architecture implementee & Feuille de route mise a jour

> **Version historique** : Ce document remplace et met a jour [plan-vision-globale.md](plan-vision-globale.md) 
> qui decrivait la vision initiale avec une stack Astro + serverless (Cloudflare/Netlify).
> **Evolution majeure** : Le projet a ete implemente avec une architecture differente 
> (VPS Docker Compose + PostgreSQL/PostGIS) comme decrit dans [plan-brique-1-mvp.md](plan-brique-1-mvp.md). 
> Cette version V2 integre **l'etat reel du code** tout en conservant la vision complete initiale.

---

## Contexte et objectifs

La commune de **Val-d'Aigoual** (Gard) et son intercommunalite, 
la **Communaute de communes Causses Aigoual Cevennes - Terres Solidaires**, 
ne disposent d'aucun point d'entree unique presentant les donnees publiques du territoire.

Ces donnees existent pourtant en abondance et sont ouvertes (Licence Ouverte / ODbL) : 
population, geographie de montagne, climat exceptionnel du Mont Aigoual, 
risques naturels, biodiversite (coeur du Parc national des Cevennes), eau, finances, tourisme, services...

**Objectif** : construire un **portail territorial open data** qui agrage et met en valeur 
**l'ensemble** de ces donnees, a la fois comme portail grand public (habitants + touristes), 
observatoire chiffre et explorateur cartographique.

**Decisions validees avec le commanditaire** :
- Vocation : **toutes les donnees** — le site combine presentation editoriale, tableaux de bord et carte SIG.
- **Architecture revisee** : **serveur auto-heberge** (VPS ~2 vCPU / 4 Go) avec **PostgreSQL + PostGIS**, 
  services Node.js/TypeScript (Fastify), worker d'ingestion planifie, frontend Astro — orchestré par **Docker Compose**.
- Perimetre : **couverture large par briques** — MVP (Brique 1) centre sur l'explorateur cartographique, 
  puis extension progressive aux autres domaines.

---

## Identite du territoire

Ces constantes pilotent **toutes** les requetes API. Centralisees dans `packages/shared/src/territoire.ts`.

| Element | Valeur | Verifie via |
|---|---|---|
| Commune | **Val-d'Aigoual** | geo.api.gouv.fr |
| Code INSEE (COG) | **30339** | geo.api.gouv.fr `/communes` |
| SIREN commune | **200082725** | OFGL / recherche-entreprises |
| Code postal | 30570 | geo.api |
| Communes deleguees | **Valleraugue** (chef-lieu, ex-30339) + **Notre-Dame-de-la-Rouviere** (ex-30190) | fusion 01/01/2019 |
| EPCI | **CC Causses Aigoual Cevennes - Terres Solidaires** | geo.api `/epcis` |
| SIREN / code EPCI | **200034601** (identiques) | geo.api / recherche-entreprises |
| Communes membres EPCI | **15** | `/epcis/200034601/communes` |
| Population commune | **1 412** (municipale) / 1 418 (2022, INSEE) | geo.api / INSEE |
| Population EPCI | **5 391** | geo.api |
| Centroide | 3.6272 E / 44.081 N | geo.api |
| Mairie | 3.6414 E / 44.081 N | geo.api |
| Superficie | 9 561.82 ha (~ 95.6 km2) | geo.api |
| **Mont Aigoual (sommet)** | **44.1216 N / 3.5814 E**, alt. ~ 1567 m | OSM / IGN |
| **Station meteo** | **NUM_POSTE 30339001** (SYNOP/OMM 07560) | Meteo-France |
| BBOX | `3.52, 44.02, 3.75, 44.15` | contours |
| Region / Departement | Occitanie (76) / Gard (30) | geo.api |

**15 communes EPCI** (INSEE, pop.): Causse-Begon (30074,25) - Dourbies (30105,177) - L'Estréchure (30108,151) - Lanuejols (30139,341) - Lasalle (30140,1202) - Peyrolles-en-Cevennes (30195,30) - Les Plantiers (30198,228) - Revens (30213,37) - Saint-Andre-de-Majencoules (30229,599) - Saint-Andre-de-Valborgne (30231,366) - Saint-Sauveur-Camprieu (30297,207) - Saumane (30310,303) - Soudorgues (30322,269) - Treves (30332,116) - **Val-d'Aigoual (30339,1412)**.

