# VISION.md
## Portail OpenData Val-d'Aigoual & CC Causses Aigoual Cevennes

> **Document satellite du AGENT_OPERATING_MANUAL.md**
> Ce document definit la vision strategique du projet.
> Toute decision doit etre alignee sur cette vision.

---

## 1. Mission

**Pourquoi le projet existe** :

Le projet **Portail OpenData Val-d'Aigoual & CC Causses Aigoual Cevennes** a pour mission de :

1. **Aggregation** : Centraliser toutes les donnees publiques ouvertes concernant le territoire
2. **Documentation** : Rendre ces donnees comprehensibles et accessibles
3. **Valorisation** : Mettre en valeur la richesse du territoire (montagne, climat, biodiversité)
4. **Democratisation** : Permettre aux habitants, touristes et décideurs d'acceder facilement a l'information

**Probleme resolu** :
- Les donnees publiques existent mais sont dispersees sur de multiples plateformes
- Aucune vision unifiee du territoire n'existe
- Les citoyens et acteurs locaux ne peuvent pas facilement acceder a ces informations

**Valeur creee** :
- Un point d'entree unique pour toutes les donnees territoriales
- Une carte interactive riche et performante
- Un observatoire chiffre pour le suivi du territoire

---

## 2. Ce que le projet DOIT devenir

**Objectifs non-negociables** :

✅ **Un portail complet** : Toutes les donnees identifiees doivent etre integres
✅ **Un explorateur cartographique** : Carte interactive avec relief 3D, couches thematiques
✅ **Un observatoire** : Tableaux de bord, indicateurs, series temporelles
✅ **Un referentiel** : Donnees a jour, fiables, sourcees
✅ **Auto-heberge** : Solution autonomie sur VPS, sans dependance externe critique
✅ **Open Source** : Code et donnees ouverts, reutilisables par d'autres territoires
✅ **Perenne** : Architecture simple, maintenable par une petite equipe
✅ **Accessible** : Respect des standards RGAA, performance optimisee

---

## 3. Ce que le projet ne DOIT JAMAIS devenir

**Interdictions absolues** :

❌ **Un SIG generaliste** : Pas de fonctionnalites complexes de SIG avance
❌ **Un CMS** : Pas de gestion de contenu editorial riche
❌ **Une plateforme Big Data** : Pas de traitement massifs de donnees
❌ **Une application temps reel critique** : Les donnees "live" sont secondaires
❌ **Un SaaS** : Solution specifique au territoire, pas de generalisation forcee
❌ **Une application mobile native** : Responsive web uniquement
❌ **Un projet avec dependances proprietary** : Tout doit etre open source

---

## 4. Positionnement strategique

**Cible principale** :
- Habitants du territoire (Val-d'Aigoual + 15 communes de l'EPCI)
- Touristes et randonneurs (Mont Aigoual = destination majeure)
- Elus et techniciens de la collectivite
- Associations locales et acteurs economiques

**Differenciation** :
- **Focus territorial** : Uniquement le territoire de la CC Causses Aigoual Cevennes
- **Exhaustivite** : Toutes les donnees ouvertes disponibles sont integres
- **Simplicite** : Interface intuitive, accessible sans formation
- **Performance** : Carte fluide, temps de chargement optimises

**Modele economique** :
- 100% open source
- Auto-heberge sur infrastructure legere (VPS ~2 vCPU / 4 Go)
- Pas de monetisation, pas de publicite
- Maintenu par la collectivite ou des contributeurs benevoles

---

## 5. Indicateurs de succes

**MVP (Brique 1)** :
- [ ] Carte interactive avec fonds IGN + couches thematiques
- [ ] 10 sources de donnees integres et visualisables
- [ ] Recherche d'adresse fonctionnelle
- [ ] Popups riches avec liens vers les sources
- [ ] Site deploye et accessible publiquement

**Version complete (Briques 1-5)** :
- [ ] 14 sections thematiques couvertes
- [ ] 50+ sources de donnees integres
- [ ] Tableaux de bord avec indicateurs clefs
- [ ] Series temporelles (climat, population, finances)
- [ ] Documentation complete des sources
- [ ] Audit Lighthouse > 90 sur performance, accessibilite, SEO

---

## 6. Contraintes externes

**Contraintes techniques** :
- Infrastructure : VPS avec 2 vCPU / 4 Go RAM minimum
- Bandwidth : Respect du fair-use des API publiques (1 appel = 1 ingestion planifiee)
- Stockage : Donnees statiques en base PostgreSQL/PostGIS

**Contraintes juridiques** :
- Respect des licences : Licence Ouverte, ODbL, CC-BY-SA
- Attribution systematique des sources
- Pas de contourner les restrictions d'usage (ex: CC-BY-NC-SA pour EOX)

**Contraintes temporelles** :
- MVP (Brique 1) : Priorite absolue
- Briques 2-5 : Planifiees mais non urgentes
- Maintenance : Capacite limitee (1 developpeur principal)

---

## 7. Principes de conception

**Approche produit** :
1. **Mobile-first** : Concu d'abord pour mobile, puis adapte au desktop
2. **Progressive enhancement** : Fonctionnel sans JavaScript, enrichi avec
3. **Graceful degradation** : Degrade elegant si une API est indisponible
4. **Minimalisme** : Une seule facon de faire chaque chose
5. **Consistance** : Memes patterns dans tout le codebase

**Approche donnees** :
1. **Source unique de verite** : Une seule definition par donnee (territoire.ts)
2. **Traceabilite** : Chaque donnee a une source, une date, une licence
3. **Qualite** : Donnees validees avant integration
4. **Actualite** : Mise a jour reguliere des sources

---

## 8. Glossaire

| Terme | Definition |
|-------|------------|
| **COG** | Code Officiel Geographique (code INSEE de la commune) |
| **EPCI** | Etablissement Public de Cooperation Intercommunale |
| **SIREN** | Systeme d'Identification du Repertoire des Entreprises |
| **BSS** | Banques de Sous-Sol (forages, piezometres) |
| **Hub'Eau** | Plateforme nationale des donnees sur l'eau |
| **IGN** | Institut National de l'Information Geographique et Forestiere |
| **BRGM** | Bureau de Recherches Geologiques et Minieres |
| **PostGIS** | Extension spatiale de PostgreSQL |
| **WMTS** | Web Map Tile Service (standard OGC pour les tuiles carto) |
| **WMS** | Web Map Service (standard OGC pour les images carto) |
| **GeoJSON** | Format d'echange de donnees geospatiales (JSON) |
| **PMTiles** | Format de tuiles vectorielles ou raster (alternative a MBTiles) |

---

## 9. References

- [AGENT_OPERATING_MANUAL.md](./AGENT_OPERATING_MANUAL.md) — Document maitre
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Architecture technique
- [plan-brique-1-mvp.md](./plan-brique-1-mvp.md) — Plan detaille du MVP
- [plan-vision-globale-v4.md](./plan-vision-globale-v4.md) — Vision initiale complete
- [CLAUDE.md](../CLAUDE.md) — Guide pour Claude Code

---

> **Derniere mise a jour** : 2026-07-10
> **Responsable** : Architecte (vous)
> **Statut** : Document de reference — Toute modification doit etre validee
