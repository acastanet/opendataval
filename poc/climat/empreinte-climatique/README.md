# Empreinte climatique

Ce dépôt autonome produit l’empreinte climatique annuelle d’un lieu à partir de
données réelles du Climate Data Store (CDS). Il télécharge les séries, calcule
six indicateurs sur 1996–2025, construit l’indice d’empreinte bilan et génère un
JSON, trois SVG et une page HTML.

Le pipeline utilise la référence climatologique 1991–2020. Les données sont des
réanalyses sur grille : elles décrivent le contexte climatique du lieu et ne
constituent pas une mesure à l’échelle d’une dalle de 100 m.

## Prérequis

- Python 3.12 ou Docker ;
- un compte CDS ;
- l’acceptation préalable des licences ERA5-Land, ERA5-HEAT et ERA5-Drought ;
- une clé enregistrée dans `~/.cdsapirc`.

Copier `.cdsapirc.example` vers le dossier personnel sous le nom `.cdsapirc`,
puis remplacer la valeur factice. Ne jamais ajouter ce fichier au dépôt.

## Installation locale

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:PYTHONPATH="src"
```

## Produire un nouveau lieu

```powershell
python -m empreinte_climatique build `
  --lat 44.06465392551458 `
  --lon 3.6829349237761435 `
  --tile-id GPD-44.064654-3.682935 `
  --output output
```

La commande sélectionne les mailles 0,1° et 0,25° les plus proches, télécharge
les six actifs nécessaires dans `output/raw/`, calcule l’empreinte et écrit :

- `output/climate-fingerprint-v4.json` : contrat de données et provenance ;
- `output/climate-fingerprint-v4.svg` : matrice principale, fond clair ;
- `output/climate-fingerprint-v4-neutral.svg` : même matrice, bandes en relief sur
  fond gris neutre ;
- `output/exceptional-events-v4.svg` : événements séparés ;
- `output/climate-fingerprint-v4.html` et `output/index.html` : aperçu complet.

Les fichiers bruts sont réutilisés lors d’une relance. Pour reconstruire sans
accès réseau depuis un cache complet :

```powershell
python -m empreinte_climatique build --lat 44.06465392551458 --lon 3.6829349237761435 --output output --reuse-raw
```

Pour réexporter uniquement les rendus depuis un JSON existant :

```powershell
python -m empreinte_climatique render --input example/climate-fingerprint-v4.json --output output
```

## Exécution avec Docker

```powershell
docker build -t empreinte-climatique .
docker run --rm `
  -v "${PWD}\output:/app/output" `
  -v "$env:USERPROFILE\.cdsapirc:/root/.cdsapirc:ro" `
  empreinte-climatique build `
  --lat 44.06465392551458 `
  --lon 3.6829349237761435 `
  --output /app/output
```

## Indicateurs

La matrice contient : température moyenne, stress UTCI P95, précipitations
annuelles, jours de pluies intenses, mois de sécheresse SPEI-3 et jours de vent
fort. Chaque ligne se lit d’un trait sur trente ans ; deux filets pointillés
marquent le passage d’une décennie à l’autre sans couper la bande. Aucun trait
ne détache la ligne bilan : seul un interligne élargi la sépare des six
indicateurs qui l’alimentent.

Deux habillages sont publiés à partir des mêmes valeurs, via le paramètre `theme`
de `render_climate_fingerprint_svg` :

| Thème | Fond | Bandes |
| --- | --- | --- |
| `light` (défaut) | `#FAFAF7` | posées à plat |
| `neutral` | `#C5C4C1` | plaque `#FBFAF7` légèrement ombrée, la bande se détache du fond |

L’ombre est portée par une plaque pleine dessinée sous chaque bande, et non par
le groupe des trente cellules : le résultat ne dépend pas de la façon dont le
moteur compose des rectangles jointifs.

La couleur d’une cellule mesure l’écart de l’année à la référence 1991–2020,
exprimé en écarts-types robustes : `sigma = (P90 − P10) / 2,563`, puis
`z = (valeur − P50) / sigma`, borné à ±3 σ. Une courbe d’accentuation réserve la
couleur franche à l’exceptionnel : 1 σ reste blanc, 2 σ se voit nettement, 3 σ
sature la palette. Le percentile ne sert plus que de repli quand la référence est
trop courte ou dégénérée — il saturait à P100 et confondait des records
d’intensité très différente.

L’indice « Empreinte bilan » est la moyenne **signée** de ces écarts accentués
sur les séries disponibles : bleu pour les indicateurs exceptionnellement bas,
rouge pour les hauts, blanc pour une année ordinaire. Un excès et un déficit
simultanés se compensent ; l’infobulle publie séparément les deux comptes pour
que cette compensation reste lisible.

## Tests

```powershell
$env:PYTHONPATH="src"
python -m unittest discover -s tests -v
```

Les tests verrouillent les 30 années, les six séries, les données de référence,
le sens bleu = moins / rouge = plus, la continuité de chaque bande et ses deux
filets décennaux, l’absence de tout trait horizontal, le fait qu’une année
ordinaire reste blanche et que deux records distincts ne partagent plus la même
couleur, les états manquants, les événements séparés, le calcul signé de l’indice
bilan et le fait que le thème `neutral` ne recolore aucune cellule.

## Structure

```text
src/empreinte_climatique/
  assets.py          lecture CSV et NetCDF
  fetch.py           téléchargement CDS paramétré par coordonnées
  fingerprint.py     calculs, palettes et rendus SVG
  build.py           assemblage et écriture des livrables
  cli.py             commandes build et render
  templates/         page HTML de production
tests/                tests et fixture de non-régression
docs/                 spécification fonctionnelle
example/              un unique exemple final publiable
```

`output/`, les caches, les journaux, les environnements virtuels et les secrets
sont ignorés par Git. Le dossier `example/` est volontairement conservé comme
référence visuelle et contractuelle pour les développeurs internes.
