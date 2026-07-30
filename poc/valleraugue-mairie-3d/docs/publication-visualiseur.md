# Publication du visualiseur — instructions d'exécution

## Objet et périmètre

Ce document est le brief de l'agent qui **publie le visualiseur** du POC sur l'infrastructure
Caddy d'OpenDataVdA. Le périmètre est le site web et lui seul : le visualiseur est un dossier
statique déjà produit par `poc.py web`, et la publication consiste à le servir, pas à le
recalculer.

Le **transfert** du dossier vers le serveur est traité à part, dans
[`publication-tailscale.md`](publication-tailscale.md) : ce document-ci s'arrête à ce qu'il
faut produire et à la façon de le servir.

**Hors périmètre, à ne pas toucher :**

- la chaîne d'enrichissement Python (`src/poc3d/`, `poc.py`) et ses tests — le dossier à
  publier est une **sortie** de cette chaîne ;
- l'étape amont LiDAR + Roofer ([`lidar-roofer.md`](lidar-roofer.md)) ;
- la construction d'une nouvelle scène ([`construire-une-scene.md`](construire-une-scene.md)) ;
- les autres routes du [`Caddyfile`](../../../Caddyfile) et les services du
  [`docker-compose.yml`](../../../docker-compose.yml).

Les sections 1 à 5 décrivent une **première mise en ligne**. Pour une publication déjà en
place — nouvelle scène, correction du visualiseur, scène régénérée — aller directement au
**§ 8, mettre à jour une publication existante** : la plupart des étapes n'ont pas à être
refaites, et refaire les mauvaises casse la route.

## 1. Ce qui est publié

`poc.py web` assemble un dossier `output-*/run-AAAAMMJJ-HHMMSS/web/` entièrement autonome :
chemins relatifs, `importmap` vers `vendor/`, aucune requête vers un domaine externe (vérifié :
`viewer/index.html`, `viewer/app.js` et `viewer/styles.css` ne contiennent aucune URL absolue).
Le visualiseur n'appelle ni WMS, ni CDN, ni police distante à l'exécution — l'orthophotographie
est déjà cuite dans le GLB.

```
web/
├── index.html            16 Ko
├── app.js                64 Ko
├── styles.css            20 Ko
├── viewer-manifest.json
├── assets/
│   ├── scene.glb         23 Mo   ← emprise 200 m, scène chargée par défaut
│   ├── scene.json                  métadonnées de traçabilité
│   ├── buildings.json   357 Ko     attributs BD TOPO par bâtiment
│   ├── scenes.json                 manifeste du sélecteur de scènes
│   └── scenes/
│       ├── poc-600m/
│       │   ├── scene.glb   57,5 Mo   ← Valleraugue, emprise 600 m
│       │   ├── scene.json
│       │   └── buildings.json 979 Ko
│       └── notre-dame-rouviere-200m/
│           ├── scene.glb   18,7 Mo   ← Notre-Dame-de-la-Rouvière, emprise 200 m
│           ├── scene.json
│           └── buildings.json
└── vendor/               2,3 Mo    Three.js 0.178.0 + addons (MIT)
```

Total mesuré : **81 Mo** pour les deux emprises de Valleraugue, auxquelles s'ajoutent
18,7 Mo depuis que la scène 200 m de Notre-Dame-de-la-Rouvière existe. Décision retenue :
**toutes les scènes assemblées**, une emprise 200 m en scène par défaut. L'ordre n'est pas
cosmétique — la première scène du manifeste est celle que le navigateur télécharge au
chargement, et 23 Mo contre 57,5 Mo change l'expérience du premier visiteur. Les autres ne
partent que si on les choisit dans le sélecteur.

Le décompte ci-dessus est celui d'un état donné : `poc.py web` publie **toute** scène dont la
configuration porte un `render/scene.glb`, et le total croît d'une vingtaine de mégaoctets par
scène 200 m ajoutée. Le vérifier avant chaque mise en ligne.

Le seul état conservé côté client est un `localStorage` de réglages d'affichage. Aucun cookie,
aucune mesure d'audience, aucune donnée personnelle : `buildings.json` ne porte que des
attributs BD TOPO publics (identifiants `cleabs`, hauteurs, dates, matériaux).

## 2. Produire le dossier à publier

Depuis `poc/valleraugue-mairie-3d`, avec le `.venv` du POC :

```powershell
.\.venv\Scripts\python.exe poc.py --config config\poc-200m.conf web
```

La configuration passée détermine la scène par défaut : elle est la première entrée du
manifeste, donc celle que le navigateur télécharge au chargement. Préparer depuis une emprise
200 m. Ne pas préparer depuis `poc-600m.conf`, qui imposerait 57,5 Mo au premier visiteur.

**Cette étape n'est pas facultative.** Les dossiers `web/` présents sur le poste peuvent
précéder les dernières modifications du visualiseur : au 30 juillet 2026,
`output-600m/run-20260729-225523/web/app.js` pesait 29 Ko contre 64 Ko pour
`viewer/app.js`. Publier un `web/` périmé met en ligne une ancienne interface sans que rien ne
le signale.

Contrôles à passer avant d'aller plus loin :

1. `assets/scenes.json` contient une entrée par scène assemblée, une 200 m d'abord ;
2. `index.html`, `app.js` et `styles.css` du dossier `web/` sont identiques à ceux de
   `viewer/` (comparer les tailles ou les empreintes) ;
3. tous les `scene.glb` / `scene.json` référencés par le manifeste existent bien ;
4. chaque entrée porte un `title` — sans lui, deux scènes de même taille sont indiscernables.

## 3. Figer un chemin de déploiement stable

Le dossier source est horodaté : le monter directement lierait Caddy à une exécution précise et
casserait la route à la préparation suivante. Copier le contenu vers un chemin fixe :

```powershell
$source = Resolve-Path .\output-200m\run-*\web | Select-Object -Last 1
Remove-Item -Recurse -Force .\publication -ErrorAction SilentlyContinue
Copy-Item -Recurse $source .\publication
```

`publication/` est déjà exclu par le [`.gitignore`](../.gitignore) du POC. Les GLB **ne sont
jamais versionnés** : 81 Mo par publication dans l'historique Git, pour un artefact
reproductible en une commande, ne se justifie pas. Git LFS n'est pas une solution de repli ici.

### Précompression

Mesures sur les scènes réelles : `gzip -6` ramène la 200 m de 23 Mo à **7,5 Mo** et la 600 m de
57,5 Mo à **18,9 Mo**. La géométrie en `float32` domine le fichier, pas les textures JPEG qu'il
embarque — la compression vaut donc largement le détour, mais compresser 57,5 Mo à la volée
coûte environ **1,3 s de CPU par requête non mise en cache**. Précompresser une fois :

```bash
# Git Bash, depuis poc/valleraugue-mairie-3d/publication
find . -name '*.glb' -o -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' \
  | xargs -I{} gzip -9 -k -f {}
```

Caddy servira le `.gz` aux clients qui l'acceptent via `precompressed` (§ 4). Ajouter les `.zst`
avec `zstd -19 -k` si l'outil est disponible : Caddy les préfère, mais leur absence n'est pas
bloquante.

## 4. Route Caddy

Ajouter ce bloc au [`Caddyfile`](../../../Caddyfile), **avant** le `handle` final qui sert
`/srv` — les blocs `handle` sont mutuellement exclusifs et évalués dans leur ordre d'apparition.

```caddy
	# Visualiseur 3D du POC Valleraugue : dossier statique monté au runtime, hors du bundle
	# Astro (cf. poc/valleraugue-mairie-3d/docs/publication-visualiseur.md).
	redir /valleraugue-3d /valleraugue-3d/ 308
	handle_path /valleraugue-3d/* {
		root * /srv/valleraugue-3d

		@glb path *.glb
		header @glb Content-Type "model/gltf-binary"

		# Les scènes gardent le même nom d'une publication à l'autre : la revalidation par
		# ETag est ce qui évite de servir une géométrie périmée pendant un an.
		header /assets/* Cache-Control "public, max-age=86400"
		header /vendor/* Cache-Control "public, max-age=86400"
		header Cache-Control "public, max-age=0, must-revalidate"

		precompressed zstd gzip
		encode zstd gzip
		file_server
	}
```

Points à ne pas simplifier :

- **`redir` puis `handle_path`.** Sans la redirection vers le slash final, `/valleraugue-3d`
  résoudrait `./assets/scene.glb` à la racine du site et le visualiseur échouerait sur des 404.
  `handle_path` retire le préfixe, ce que `handle` ne fait pas.
- **`Content-Type` du GLB.** La table MIME de Caddy ignore `.glb` et renverrait
  `application/octet-stream`. `GLTFLoader` lit un `ArrayBuffer` et s'en accommode, mais l'entête
  correct coûte deux lignes.
- **`precompressed` avant `encode`.** Caddy ne recompresse pas une réponse dont le
  `Content-Encoding` est déjà posé ; `encode` ne prend donc le relais que pour ce qui n'a pas de
  `.gz` sur disque.

### CSP : rien à élargir

Contrairement à ce qui pouvait être craint, la `Content-Security-Policy` du site couvre le
visualiseur en l'état. Vérifié ligne à ligne : les modules ES viennent de `vendor/` (`script-src
'self'`), l'`importmap` inline est couvert par `'unsafe-inline'`, les textures extraites du GLB
passent par des URL `blob:` déjà autorisées en `img-src`, le `fetch` des scènes reste en
`connect-src 'self'`, et le visualiseur n'instancie aucun `Worker`. **Ne pas modifier la CSP.**

Conséquence à connaître : `frame-ancestors 'none'` et `X-Frame-Options: DENY` interdisent tout
affichage en `iframe`. Si la commune demande un embarquement dans son site, c'est une décision
d'architecture à remonter — pas une ligne à changer au passage.

## 5. Montage du dossier et contexte de build

Monter le dossier en lecture seule sur le service `caddy` du
[`docker-compose.yml`](../../../docker-compose.yml), selon la convention déjà en place pour les
extraits de relief (`./apps/web/public/relief:/srv/relief:ro`) :

```yaml
    volumes:
      - caddy_data:/data
      - caddy_config:/config
      - ./poc/valleraugue-mairie-3d/publication:/srv/valleraugue-3d:ro
```

Compléter ensuite le [`.dockerignore`](../../../.dockerignore) :

```
# Sorties du POC 3D (~1 Go) : servies par un volume runtime, jamais dans un contexte de build.
poc/**/output*/
poc/**/publication/
poc/**/.venv/
poc/**/.work*/
```

Ce point vaut d'être corrigé indépendamment de la publication : `poc/valleraugue-mairie-3d`
pèse **1,0 Go** aujourd'hui et rien ne l'exclut du contexte envoyé au démon Docker à chaque
`docker compose build caddy`.

## 6. Mention de licence — en place, à préserver

La Licence Ouverte 2.0 sous laquelle l'IGN diffuse ces données impose la mention de paternité.
Elle est **déjà servie** : le dialogue « Informations sur les données » porte une section
« Licence et attribution », construite par `addDataSection` dans `viewer/app.js`.

Ce qu'elle annonce, et qui ne doit pas disparaître d'une refonte du dialogue :

- **Données** : LiDAR HD, BD TOPO® et ORTHOPHOTOS® — © IGN, Licence Ouverte 2.0 (Etalab),
  réutilisation libre sous réserve de mentionner la source et sa date de mise à jour ;
- **Reconstruction** : Roofer, 3D Geoinformation, TU Delft ;
- **Affichage** : Three.js, licence MIT. La révision est **lue dans la bibliothèque**
  (`THREE.REVISION`) et non recopiée : la version annoncée est celle que `poc.py web` a
  téléchargée, pas celle qu'un littéral aurait figée.

Les fichiers de `vendor/` sont servis intacts, en-têtes de licence compris : ne pas les
minifier.

Toute modification d'`app.js` impose de reprendre la préparation du § 2 — le dossier `web/`
embarque une **copie** d'`app.js`, pas un lien vers lui.

## 7. Recette

Après `docker compose up -d caddy`, sur le port publié (`8080` en local) :

| Vérification | Attendu |
| --- | --- |
| `curl -I http://localhost:8080/valleraugue-3d` | `308` vers `/valleraugue-3d/` |
| `curl -I http://localhost:8080/valleraugue-3d/` | `200`, `text/html` |
| `curl -sI -H 'Accept-Encoding: gzip' .../assets/scene.glb` | `Content-Encoding: gzip`, `Content-Type: model/gltf-binary` |
| `curl -I .../assets/scenes.json` | `200`, autant d'entrées que de scènes publiées |
| Navigateur, console ouverte | scène 200 m chargée, **aucune** erreur CSP ni 404 |
| Sélecteur de scènes | bascule vers chaque autre scène et retour, sans erreur ; le titre de l'en-tête et l'onglet suivent |
| Dialogue « Informations sur les données » | section licence présente |
| `curl -I .../assets/../index.html` | pas d'évasion hors de `/srv/valleraugue-3d` |

Rendre compte de la publication en indiquant l'URL servie, les scènes publiées avec leur run
(`run-AAAAMMJJ-HHMMSS`) et le volume monté, puis proposer le commit des seules modifications
versionnées : `Caddyfile`, `docker-compose.yml`, `.dockerignore` et ce document. Le contenu de
`publication/` ne fait **jamais** partie du commit.

### État au 30 juillet 2026

| Élément | État |
| --- | --- |
| Mention de licence dans le dialogue (§ 6) | **en place** |
| `publication/` dans le `.gitignore` du POC (§ 3) | **en place** |
| Route `/valleraugue-3d` dans le `Caddyfile` (§ 4) | à ajouter |
| Volume dans le `docker-compose.yml` (§ 5) | à ajouter |
| Entrées `poc/**` dans le `.dockerignore` (§ 5) | à ajouter |
| Scènes assemblées | Valleraugue 200 m et 600 m, Notre-Dame-de-la-Rouvière 200 m |

Le visualiseur n'a donc **jamais encore été mis en ligne** : les trois lignes manquantes sont
ce qui reste à faire pour une première publication.

## 8. Mettre à jour une publication existante

La route Caddy, le volume monté et le `.dockerignore` sont posés une fois pour toutes. Une
mise à jour ne rejoue que ce que le changement impose.

| Ce qui a changé | Étapes à rejouer |
| --- | --- |
| Le visualiseur (`viewer/index.html`, `app.js`, `styles.css`) | § 2 → § 3 → transfert → § 7 |
| Une scène existante réassemblée (`poc.py all`) | § 2 → § 3 → transfert → § 7 |
| **Une scène ajoutée** (`poc.py scene` puis étape amont puis `poc.py all`) | § 2 → § 3 → transfert → § 7, en contrôlant le volume total et l'ordre du manifeste |
| Le `Caddyfile` ou le `docker-compose.yml` | `docker compose up -d caddy`, puis § 7 |
| Rien du tout, seulement les données amont | rien : le GLB publié ne change pas tant qu'il n'est pas réassemblé |

Le **transfert** vers le serveur est décrit dans
[`publication-tailscale.md`](publication-tailscale.md). En local, `docker compose up -d caddy`
suffit puisque le volume pointe directement sur `publication/`.

### Ajouter une scène au menu en ligne

Une scène apparaît dans le sélecteur du seul fait que sa configuration existe et que son
`OUTPUT_DIR` porte un `render/scene.glb`. Rien à déclarer ni côté Caddy, ni côté JavaScript.
La séquence complète, depuis un point sur une carte, est dans
[`construire-une-scene.md`](construire-une-scene.md) ; côté publication, trois points seulement :

1. **Régénérer le dossier depuis une emprise 200 m** (§ 2). La configuration passée à
   `poc.py web` devient la première entrée du manifeste, donc la scène que tout visiteur
   télécharge à l'ouverture. Préparer depuis la nouvelle scène si on veut la mettre en avant,
   depuis l'ancienne sinon — mais jamais depuis une 600 m.
2. **Vérifier le volume.** Chaque scène 200 m ajoute une vingtaine de mégaoctets au dossier
   publié, et autant à transférer. `du -sh publication` avant d'envoyer.
3. **Vérifier les titres.** Chaque entrée de `assets/scenes.json` doit porter un `title` :
   sans lui, deux scènes de même taille sont indiscernables dans le menu. Le titre vient de
   `SCENE_TITLE` dans le `.conf` de la scène.

### Ce qu'il ne faut pas refaire

- **Ne pas remonter le volume ni retoucher le `Caddyfile`** pour une simple mise à jour de
  contenu : le chemin `publication/` est stable précisément pour ça.
- **Ne pas transférer un `web/` qu'on n'a pas régénéré soi-même** à l'étape § 2. C'est le
  piège le plus coûteux du lot : un `web/` datant d'une exécution précédente remet en ligne
  une ancienne interface, avec un `scenes.json` amputé des scènes ajoutées depuis, et **rien
  ne le signale**.
- **Ne pas effacer `publication/` sur le serveur** avant d'avoir reçu le remplaçant en entier :
  la bascule se fait fichier par fichier, dossier d'attente à l'appui.

## 9. Interdits

- Aucune ressource externe : pas de CDN, pas de police distante, pas de mesure d'audience, pas
  de carte de fond en ligne. L'autonomie du dossier est ce qui rend la CSP tenable.
- Ne pas versionner les GLB, les `.gz`, ni le dossier `publication/`.
- Ne pas assouplir la CSP ni les entêtes de sécurité du site pour faire passer le visualiseur :
  s'il en a besoin, c'est le visualiseur qu'il faut corriger.
- Ne pas altérer les mentions de traçabilité existantes du dialogue, hors ajout de la licence.
- Ne pas déployer un `web/` que l'on n'a pas régénéré soi-même à l'étape § 2.
