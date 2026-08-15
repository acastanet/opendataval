# POC imagesat — GPS → image satellite EUMETSAT

Voir [`plan.md`](plan.md) pour la spécification complète. Ce README couvre
l'état d'avancement réel : **POC 1 et POC 2 sont implémentés et validés**.
POC 3 (détection incendie FIR) n'a pas été fait — il recouvre en grande partie
le microservice `services/fire-detection/` déjà en production, qui utilise
cependant une API EUMETSAT différente (Data Store / CAP) de celle utilisée ici
(WMS EUMETView).

## Installation

```bash
cd poc/imagesat
python -m venv .venv
.venv/Scripts/activate   # ou source .venv/bin/activate sous Linux/macOS
pip install -r requirements.txt
```

Aucun credential EUMETSAT n'est nécessaire : le WMS EUMETView
(`https://view.eumetsat.int/geoserver/wms`) est accessible en lecture
anonyme, contrairement à l'API Data Store utilisée par
`services/fire-detection/`.

## Découverte de la couche RGB

```bash
python discover_layers.py
```

Couche retenue dans `config.json` : **`mtg_fd:rgb_truecolour`** (« True Colour
RGB - MTG-I - 0 degree »), rafraîchie toutes les 10 minutes par le FCI de
Meteosat-12 en disque complet. C'est un produit diurne (dépend de la lumière
du soleil) ; de nuit l'image sera sombre, ce qui est une limite connue du
produit et non un bug du POC.

## POC 1 — GPS → image récente

```bash
python poc1.py 44.0646 3.6830
```

Écrit `output/poc1/latest.png` et `output/poc1/metadata.json`.

### Résultats de validation (14/08/2026, ~07h20 UTC)

| Lieu           | Coordonnées       | Image obtenue | Observation (UTC)      | Latence   | Taille    | Erreur |
|----------------|-------------------|:---:|-------------------------|-----------|-----------|--------|
| Val-d'Aigoual  | 44.0646, 3.6830   | OUI | 2026-08-14T06:50:00Z    | 33.1 min  | 740 639 o | aucune |
| Marseille      | 43.2965, 5.3698   | OUI | 2026-08-14T06:50:00Z    | 33.5 min  | 384 556 o | aucune |
| Bordeaux       | 44.8378, -0.5792  | OUI | 2026-08-14T06:50:00Z    | 33.6 min  | 398 582 o | aucune |

Les trois sites produisent une image automatiquement, sans intervention dans
un navigateur. La latence observée (~33 min) correspond au temps de
publication du produit *True Colour RGB* par EUMETSAT après le balayage FCI
(le balayage lui-même a lieu toutes les 10 min ; le traitement RGB ajoute un
délai de publication supplémentaire). Cette métrique confirme ce que
`plan.md` anticipait : elle sera déterminante pour juger si ce pipeline est
assez réactif pour du suivi de feu (POC 3).

**POC 1 validé.**

## POC 2 — GPS → image géoréférencée

```bash
python poc2.py 44.0646 3.6830
```

Écrit `output/poc2/{raw.png,located.png,metadata.json,viewer.html}`.

Le géoréférencement pixel↔lat/lon est une interpolation linéaire directe
(`src/georef.py`), rendue exacte par le choix de `CRS=EPSG:4326` (plate
carrée) pour la requête `GetMap` — confirmé disponible pour la couche
retenue par `discover_layers.py`.

### Vérification que le repère n'est pas codé au centre

`poc2.py --bbox-offset-km 30` décale volontairement la bbox de 30 km vers
l'est avant de calculer la position du point GPS. Vérifié programmatiquement :

- bbox centrée sur le point → position pixel `(512, 512)` (centre de l'image
  1024×1024), comme attendu ;
- bbox décalée de 30 km → position pixel `(291, 512)`, et le pixel à cette
  position est bien rouge (`(255, 0, 0)`, couleur du repère) alors qu'un pixel
  éloigné (`(10, 10)`) garde sa couleur satellite d'origine.

Cela confirme une transformation géographique réelle, pas un point dessiné
par défaut au centre de l'image.

**POC 2 validé.**

## Arborescence

```
poc/imagesat/
├── README.md
├── plan.md
├── requirements.txt
├── config.json
├── discover_layers.py
├── poc1.py
├── poc2.py
├── src/
│   ├── bbox.py
│   ├── eumetview.py
│   ├── latest.py
│   ├── georef.py
│   └── render_location.py
└── output/         (généré à l'exécution, ignoré par git)
```

## Suite

POC 3 (confrontation à une détection de feu EUMETSAT FIR) n'a pas été
implémenté ici — voir `plan.md` pour sa spécification, et
`services/fire-detection/` pour l'équivalent déjà en production côté
détection (source de données différente : Data Store CAP, pas WMS image).
