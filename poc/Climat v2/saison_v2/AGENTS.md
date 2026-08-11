# Instructions locales — `saison_v2`

## Objet

Ce dossier est un POC autonome qui calcule et présente des saisons thermiques
locales à partir d'un snapshot ERA5-Land. Il ne fait pas partie du monorepo
pnpm : utiliser Python 3.11+ et les scripts locaux.

`service/` expose aussi ce calcul comme application FastAPI autonome. Son image
Docker ne doit jamais dépendre de fichiers situés dans le répertoire parent.

## Chaîne de données

`input/climate-snapshot.json` référence l'actif ERA5-Land (CSV) et son
SHA-256. `scripts/rebuild.py` vérifie cet actif, exécute le moteur V4 situé
dans `engine/climate_seasons_service/`, puis régénère :

- `output/thermal-seasons-v4-replay.json` (résultat scientifique) ;
- `data.js` (données consommées par l'infographie statique).

Ne modifiez pas manuellement ces deux fichiers générés. Pour récupérer de
nouvelles données, passer par `collect-and-build.bat` ; cela demande une
configuration Copernicus CDS. Ne jamais ajouter d'identifiants CDS au dépôt.

## Commandes utiles

Depuis ce répertoire :

```bat
python -m pip install -r requirements.txt
rebuild.bat
python -m unittest discover -s tests -v
python scripts/render_wheel.py
docker compose config
docker build -t seasons-wheel:local .
```

`rebuild.bat` est reproductible hors réseau tant que le snapshot est présent.
Le test de géométrie utilise `output/thermal-seasons-v4-replay.json` existant.

## Conventions de modification

- Conserver les sources Python avec annotations de types, `from __future__ import annotations` et les docstrings/commentaires en français.
- Les modules scientifiques vivent dans `engine/climate_seasons_service/`; la géométrie et le SVG de la roue dans `engine/seasons_wheel/`.
- Les scripts de coordination se trouvent dans `scripts/`. Le front statique se limite à `index.html`, `styles.css`, `app.js` et `data.js` généré.
- Le front du microservice vit séparément dans `service/static/` ; ses routes publiques restent sous `/api/v1/`.
- Toute donnée persistante du service doit rester sous `SEASONS_DATA_DIR` (`/data` dans le conteneur), jamais dans l'image.
- Toute évolution du calcul ou du rendu de roue doit inclure un test déterministe dans `tests/` et exécuter les tests ciblés.
- Préserver la méthode V4 et les métadonnées de provenance dans le résultat ; toute modification méthodologique doit être explicitée dans `README.md`.

## Vérification visuelle

Pour une modification SVG ou CSS, régénérer la roue avec
`python scripts/render_wheel.py`, puis inspecter les fichiers produits
(`seasons-wheel.svg`, `seasons-wheel.png` et `seasons-wheel-no-markers.png`).
Ne remplacer les captures de référence que si le changement visuel est voulu.
