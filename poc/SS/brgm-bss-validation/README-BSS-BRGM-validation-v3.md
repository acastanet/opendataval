# Validation investigation BSS BRGM - v3

Généré le : 2026-08-07 09:26 UTC

Périmètre : rayon max 5 000 m, 20 résultats maximum

## A. Service

```text
URL WFS : https://mapsref.brgm.fr/wxs/infoterre/catalogue
version : 1.1.0
typename : BSS_TOTAL
CRS : EPSG:2154 (Lambert-93), EPSG:4326 (WGS84)
formats : application/json; subtype=geojson; charset=utf-8
```

## B. Statistiques par rayon

| Rayon | BBOX | Cercle | Sources | Forages | Sondages | Carottages | Coupes | Docs coupe | Scans |
|---|---|---|---|---|---|---|---|---|---|
| 1.0 km | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2.0 km | 9 | 6 | 4 | 2 | 0 | 0 | 2 | 2 | 2 |
| 5.0 km | 54 | 44 | 22 | 5 | 5 | 5 | 9 | 9 | 10 |

## C. Vérifications cibles

### BSS002DKEC
- nature_brgm : SONDAGE
- category : sounding
- distance : 4894.5 m
- profondeur : 14.0
- mode_execution : ROTATION,CAROTTAGE,EAU.
- coupe_declaree : True
- document_coupe : True
- scan_coupe : True
- documents : COUPE-GEOLOGIQUE, PERMEABILITE.
- commune : SAINT ANDRE DE MAJENCOULES
- coordinates : lon=3.67646538, lat=44.0207618
- fiche InfoTerre : http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action?id=09371X0028/VA-2A

### BSS002DKFG
- nature_brgm : FORAGE
- category : borehole
- distance : 1641.2 m
- profondeur : 97.0
- mode_execution : MARTEAU-FOND.
- coupe_declaree : True
- document_coupe : True
- scan_coupe : True
- documents : COUPE-GEOLOGIQUE, COUPE-TECHNIQUE, PRODUCTIVITE.
- commune : NOTRE DAME DE LA ROUVIERE
- coordinates : lon=3.70350703, lat=44.06481465
- fiche InfoTerre : http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action?id=09372X0012/MONNA

## D. Résultats par rayon (sélections métier)

### Rayon 1.0 km

- nearest_any : N/A (N/A)
- nearest_borehole : N/A (N/A)
- nearest_sounding : N/A (N/A)
- nearest_core_sample : N/A (N/A)
- nearest_geological_section : N/A

### Rayon 2.0 km

- nearest_any : BSS002DKEY (SOURCE)
- nearest_borehole : BSS002DKFG (FORAGE)
- nearest_sounding : N/A (N/A)
- nearest_core_sample : N/A (N/A)
- nearest_geological_section : BSS002DKFG

### Rayon 5.0 km

- nearest_any : BSS002DKEY (SOURCE)
- nearest_borehole : BSS002DKFG (FORAGE)
- nearest_sounding : BSS002DKEC (SONDAGE)
- nearest_core_sample : BSS002DKEC (SONDAGE)
- nearest_geological_section : BSS002DKFG

## E. Les 20 ouvrages les plus proches (rayon 5 km)

| Rang | BSS ID | Ancien code | Nature BRGM | Category | Distance | Profondeur | Commune | Coupe |
|---|---|---|---|---|---|---|---|---|
| 1 | BSS002DKEY | 09372X0004/AURIOL | SOURCE | all | 1477.4 m | - | VAL D AIGOUAL | Non |
| 2 | BSS002DKFG | 09372X0012/MONNA | FORAGE | borehole | 1641.2 m | 97.00 m | NOTRE DAME DE LA ROUVIERE | Oui |
| 3 | BSS002DKFK | 09372X0015/F3 | FORAGE | borehole | 1756.3 m | 5.30 m | NOTRE DAME DE LA ROUVIERE | Oui |
| 4 | BSS002DKDU | 09371X0018/PEYRE | SOURCE | all | 1781.3 m | - | VAL D AIGOUAL | Non |
| 5 | BSS002DKFB | 09372X0007/VALLON | SOURCE | all | 1950.2 m | - | NOTRE DAME DE LA ROUVIERE | Non |
| 6 | BSS002DKDK | 09371X0009/TALEYR | SOURCE | all | 1960.3 m | - | VAL D AIGOUAL | Non |
| 7 | BSS002DKDG | 09371X0004/111111 | SOURCE | all | 2156.6 m | - | VAL D AIGOUAL | Non |
| 8 | BSS002DKDS | 09371X0016/FIGAYR | SOURCE | all | 2161.5 m | - | VAL D AIGOUAL | Non |
| 9 | BSS002DKDT | 09371X0017/GALERI | SOURCE | all | 2261.6 m | - | VAL D AIGOUAL | Non |
| 10 | BSS002DKFC | 09372X0008/PUECH | SOURCE | all | 2321.0 m | - | NOTRE DAME DE LA ROUVIERE | Non |
| 11 | BSS002DKEU | 09371X4012/GT | INDICE-GITOLOGIQUE | all | 2443.4 m | - | VAL D AIGOUAL | Non |
| 12 | BSS002DKFT | 09372X4002/GT | INDICE-GITOLOGIQUE | all | 2805.7 m | - | NOTRE DAME DE LA ROUVIERE | Non |
| 13 | BSS002DKDF | 09371X0003/VIELLE | SOURCE | all | 2985.5 m | - | SAINT ANDRE DE MAJENCOULES | Non |
| 14 | BSS002DKFU | 09372X4003/GT | GITE-MINIER | all | 3033.7 m | - | NOTRE DAME DE LA ROUVIERE | Non |
| 15 | BSS002DKFP | 09372X0019/SCE2 | SOURCE | all | 3257.9 m | - | PLANTIERS | Non |
| 16 | BSS002DKEL | 09371X4002/GT | GITE-MINIER | all | 3264.2 m | - | VAL D AIGOUAL | Non |
| 17 | BSS002DKFN | 09372X0018/S2 | SOURCE | all | 3296.4 m | - | PLANTIERS | Non |
| 18 | BSS002DKFF | 09372X0011/MOUILL | SOURCE | all | 3387.3 m | - | PLANTIERS | Non |
| 19 | BSS002DKFJ | 09372X0014/RANDAU | FORAGE | borehole | 3394.0 m | 73.00 m | NOTRE DAME DE LA ROUVIERE | Oui |
| 20 | BSS002DKEM | 09371X4003/GT | INDICE-GITOLOGIQUE | all | 3573.3 m | - | VAL D AIGOUAL | Non |
## F. Limites et problèmes

- MAXFEATURES : garde-fou à 500. Pour 5 km, 54 objets sont retournés, donc pas de limite atteinte.
- InfoTerre : accessible en HTTP (port 80) depuis ce réseau. Vérifier en production.
- Carottage : détecté uniquement via `mode_execution` (ex: 'ROTATION,CAROTTAGE,EAU.').
  Aucun champ dédié 'carottage' n'existe.
- log_geol_valide : aucun ouvrage avec log validé dans un rayon de 5 km.

## G. Tableau de validation

```text
Critère                                      Résultat
----------------------------------------------------
WFS fonctionnel                              OUI
Recherche 1.0 km reproductible                 OUI
Recherche 2.0 km reproductible                 OUI
Recherche 5.0 km reproductible                 OUI
Rayon > 5 km refusé                          OUI
Distinction erreur BRGM / zero                OUI
Calcul distance                              OUI
Filtre cercle                                OUI
Tri distance                                 OUI
Maximum 20 résultats                        OUI
FORAGE                                       OUI
SONDAGE*                                     OUI
CAROTTAGE                                    OUI
Coupe géologique                            OUI
BSS002DKFG                                   OUI
BSS002DKEC                                   OUI
README généré depuis JSON                   OUI
Tests automatiques                           OUI
```

## Décision

**GO IMPLEMENTATION**

Tous les critères sont remplis. Le dataset BSS BRGM est cohérent, reproductible et filtrable.
Périmètre fonctionnel à implémenter :
- distance maximale = 5 km
- 20 résultats maximum