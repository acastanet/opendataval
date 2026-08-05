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
├── index.html
├── app.js
├── styles.css
├── favicon.svg
├── viewer-manifest.json
├── assets/                          ← la scène par défaut, à la racine
│   ├── scene.glb        21,9 Mio  ← emprise 200 m, scène chargée au démarrage
│   ├── scene.json                   métadonnées de traçabilité
│   ├── buildings.json    351 Kio    attributs BD TOPO par bâtiment
│   ├── geology.png        23 Kio    carte géologique BRGM, chargée à la demande
│   ├── geology-pick.png   18 Kio    carte d'identifiants, jamais affichée
│   ├── geology.json        2 Kio    légende et provenance de la couche
│   ├── scenes.json                  manifeste du sélecteur de scènes
│   └── scenes/                      ← les huit autres, un dossier chacune
│       ├── poc-600m/          scene.glb 101,1 Mio  Valleraugue, emprise 600 m
│       ├── balcon-du-vertige-500m/       39,5 Mio  Gorges de la Jonte
│       ├── hort-de-dieu-500m/            35,6 Mio  Mont Aigoual
│       ├── col-de-perjuret-600m/         34,9 Mio  Col de Perjuret
│       ├── chaos-nimes-le-vieux-500m/    22,9 Mio  Chaos de Nîmes-le-Vieux
│       ├── notre-dame-rouviere-200m/     17,9 Mio  Notre-Dame-de-la-Rouvière
│       ├── creyssensac-et-pissot-200m/   17,1 Mio  Creyssensac-et-Pissot
│       └── poc/                           7,4 Mio  Valleraugue, emprise 100 m
└── vendor/               2,6 Mio    Three.js 0.178.0 + addons (MIT)
```

Chaque dossier de `assets/scenes/` porte les mêmes fichiers que la racine : `scene.glb`,
`scene.json`, `buildings.json` et les trois `geology.*`, chacun doublé de son `.gz`.

Total mesuré au 2 août 2026 : **405 Mio** pour **neuf scènes**, précompression comprise —
c'est ce que rend `du -sh publication`. Hors `.gz`, le contenu utile pèse 302,6 Mio ; les
versions précompressées ajoutent 102,7 Mio, soit **34 % de surcoût sur disque et au
transfert**, prix assumé de `precompressed` (§ 4), qui exige les deux fichiers côte à côte.

Décision retenue : **toutes les scènes assemblées**, une emprise 200 m en scène par défaut.
L'ordre n'est pas cosmétique — la première scène du manifeste est celle que le navigateur
télécharge au chargement, et 21,9 Mio contre 101,1 Mio change l'expérience du premier
visiteur. Les autres ne partent que si on les choisit dans le sélecteur.

Le décompte ci-dessus est celui d'un état donné : `poc.py web` publie **toute** scène dont la
configuration porte un `render/scene.glb`, et le total croît d'une vingtaine de mébioctets par
scène 200 m ajoutée — davantage pour une emprise 500 ou 600 m, qui pèse deux à cinq fois plus.
Le vérifier avant chaque mise en ligne plutôt que de reprendre les chiffres de ce document :
ils ont déjà quintuplé depuis sa première rédaction.

La carte géologique ne pèse pas dans cette balance : **250 Ko pour cinq scènes**, aplats de
couleur que le PNG compresse très efficacement. C'est aussi pourquoi elle est publiée hors du
GLB plutôt qu'embarquée — non pas pour le poids, mais parce que le visualiseur ne la
télécharge qu'à l'activation de sa bascule. Une scène regardée sans la géologie ne la paie
jamais.

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
200 m. Ne pas préparer depuis `poc-600m.conf`, qui imposerait **101,1 Mio** au premier
visiteur — 26,2 Mio même une fois compressés, contre 7,3 Mio pour la 200 m.

**Cette étape n'est pas facultative.** Les dossiers `web/` présents sur le poste peuvent
précéder les dernières modifications du visualiseur : au 30 juillet 2026,
`output-600m/run-20260729-225523/web/app.js` pesait 29 Ko contre 64 Ko pour
`viewer/app.js`. Publier un `web/` périmé met en ligne une ancienne interface sans que rien ne
le signale.

Contrôles à passer avant d'aller plus loin :

1. `assets/scenes.json` contient une entrée par scène assemblée, une 200 m d'abord ;
2. `index.html`, `app.js`, `styles.css` et `favicon.svg` du dossier `web/` sont identiques à
   ceux de `viewer/` (comparer les tailles ou les empreintes) ;
3. tous les `scene.glb` / `scene.json` référencés par le manifeste existent bien, ainsi que
   les trois fichiers `geology.*` des entrées qui portent une clé `configuration.geology` ;
4. les `title` sont présents **et deux à deux distincts** — contrôler la présence ne suffit
   pas : trois entrées portent aujourd'hui le même titre `Valleraugue` (`poc`, `poc-200m`,
   `poc-600m`), et le sélecteur les rend alors indiscernables tout en passant le contrôle.

Le point 4 se vérifie en une commande, depuis le dossier préparé :

```bash
python -c "import json;t=[s['title'] for s in json.load(open('assets/scenes.json',encoding='utf-8'))];print(len(t),'entrees,',len(set(t)),'titres distincts')"
```

Les deux nombres doivent être égaux. Sinon, distinguer les titres homonymes par leur emprise
via `SCENE_TITLE` dans le `.conf` concerné (§ 8).

Une entrée **sans** clé `geology` n'est pas un défaut : la scène a été assemblée avant cette
couche, ou son département n'est pas renseigné. Le visualiseur désactive alors la bascule avec
son explication. Ce qui serait un défaut, c'est une clé présente pointant sur un fichier
absent — d'où le contrôle 3.

## 3. Figer un chemin de déploiement stable

Le dossier source est horodaté : le monter directement lierait Caddy à une exécution précise et
casserait la route à la préparation suivante. Copier le contenu vers un chemin fixe :

```powershell
$source = Resolve-Path .\output-200m\run-*\web | Select-Object -Last 1
Remove-Item -Recurse -Force .\publication -ErrorAction SilentlyContinue
Copy-Item -Recurse $source .\publication
```

`publication/` est déjà exclu par le [`.gitignore`](../.gitignore) du POC. Les GLB **ne sont
jamais versionnés** : 405 Mio par publication dans l'historique Git, pour un artefact
reproductible en une commande, ne se justifie pas. Git LFS n'est pas une solution de repli ici.

Le `Remove-Item` puis `Copy-Item` repart d'un dossier vide à chaque fois, ce qui impose de
recompresser l'intégralité des 302,6 Mio même quand une seule scène a changé. C'est le prix de
la simplicité et de la certitude qu'aucun fichier périmé ne subsiste ; sur une publication de
routine, ce sont les deux tiers du temps de préparation. Le cas échéant, une copie
différentielle (`robocopy /MIR`) suivie d'un gzip conditionnel supprimerait ce coût — à ne
tenter qu'en connaissance de cause, car un `.gz` oublié plus vieux que sa source est un défaut
silencieux.

### Précompression

Mesures refaites le 2 août 2026 sur les scènes réelles, en `gzip -6` :

| Scène | Source | Compressée | Durée |
| --- | --- | --- | --- |
| 200 m par défaut | 21,9 Mio | **7,2 Mio** | 0,79 s |
| 600 m | 101,1 Mio | **26,0 Mio** | 2,60 s |

La géométrie en `float32` domine le fichier, pas les textures JPEG qu'il embarque — la
compression vaut donc largement le détour, mais compresser la 600 m à la volée coûterait
**2,6 s de CPU par requête non mise en cache**. Précompresser une fois :

```bash
# Git Bash, depuis poc/valleraugue-mairie-3d/publication
find . \( -name '*.glb' -o -name '*.js' -o -name '*.css' -o -name '*.html' \
          -o -name '*.json' -o -name '*.png' \) -print0 \
  | xargs -0 -P 8 -n 1 gzip -6 -k -f
```

**Utiliser `-6`, pas `-9`.** Sur ces GLB, `-9` est plus lent *et* produit un fichier **plus
gros** — sa recherche de correspondances plus agressive tombe moins bien sur de la géométrie
`float32` :

| | 200 m | 600 m |
| --- | --- | --- |
| `gzip -6` | 7 529 167 o en 0,79 s | 27 212 816 o en **2,60 s** |
| `gzip -9` | 7 625 615 o en 3,96 s | 27 510 027 o en **16,03 s** |

Soit, sur la 600 m, **six fois le temps pour 297 Ko de plus à transférer**. Sur l'ensemble de
la publication, `-6` ramène l'étape de près d'une minute à une dizaine de secondes, que le
`-P 8` divise encore. Les parenthèses autour des `-name` sont nécessaires dès qu'une action
suit ; `-print0` / `-xargs -0` protègent les chemins à espaces.

**Les `.png` en font partie, contre toute attente.** Un PNG porte déjà un flux deflate et ne
devrait rien gagner à être regzippé ; les cartes géologiques, elles, tombent de 23 374 o à
**3 473 o**, soit un facteur 6,7. La raison tient au contenu : une carte drapée ne compte que
quelques aplats de couleur, si bien que le flux compressé produit par Pillow reste lui-même
très répétitif d'une ligne à l'autre. Le cas est vérifiable en une commande — `gzip -6 -c
assets/geology.png | wc -c` — et il ne se généralise pas aux PNG photographiques.

Caddy servira le `.gz` aux clients qui l'acceptent via `precompressed` (§ 4). Les `.zst`, que
Caddy préfère, sont un bonus : `zstd` n'est **pas** livré avec Git Bash, et `-19` sur 302 Mio
coûterait des dizaines de minutes pour un gain marginal sur des GLB. Si l'outil est là,
`zstd -12 --long -k` sur les seuls `*.glb` est le bon compromis. Leur absence n'est pas
bloquante : `precompressed zstd gzip` retombe sur le `.gz`.

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

		# Géométrie, textures et bibliothèques : leur contenu ne change qu'en même temps que
		# le manifeste qui les référence, un jour de cache est donc sans risque.
		@cache-long {
			path /assets/* /vendor/*
			not path *.json
		}
		header @cache-long Cache-Control "public, max-age=86400"

		# Les manifestes décident quels fichiers le visualiseur ira chercher : ils sont
		# revalidés à chaque chargement, faute de quoi une scène ajoutée resterait invisible
		# pour les visiteurs récents jusqu'à l'expiration de leur cache.
		@manifestes path *.json
		header @manifestes Cache-Control "public, max-age=0, must-revalidate"

		# Un `header` SANS matcher écrase toutes les règles ci-dessus quel que soit son
		# emplacement dans le bloc — vérifié dans les deux ordres. D'où ce matcher négatif :
		# sans lui, les deux règles précédentes seraient mortes et tout serait revalidé.
		@reste not path /assets/* /vendor/*
		header @reste Cache-Control "public, max-age=0, must-revalidate"

		encode zstd gzip
		file_server {
			precompressed zstd gzip
		}
	}
```

Points à ne pas simplifier :

- **`redir` puis `handle_path`.** Sans la redirection vers le slash final, `/valleraugue-3d`
  résoudrait `./assets/scene.glb` à la racine du site et le visualiseur échouerait sur des 404.
  `handle_path` retire le préfixe, ce que `handle` ne fait pas.
- **`Content-Type` du GLB.** La table MIME de Caddy ignore `.glb` et renverrait
  `application/octet-stream`. `GLTFLoader` lit un `ArrayBuffer` et s'en accommode, mais l'entête
  correct coûte deux lignes.
- **`precompressed` dans `file_server`, avec `encode`.** Caddy sert d'abord le `.zst` ou le
  `.gz` déjà produit ; `encode` ne prend le relais que pour ce qui n'a pas de version
  précompressée sur disque.
- **Aucune directive `header` sans matcher dans ce bloc.** Voir ci-dessous : c'est le piège le
  plus coûteux de la configuration, et il ne produit aucune erreur.

### Le `header` sans matcher écrase tous les autres

La rédaction précédente de ce bloc plaçait un `header Cache-Control "…"` sans matcher après
les deux règles `/assets/*` et `/vendor/*`. **Ces deux règles étaient mortes** : tout le
visualiseur, GLB et `vendor/` compris, était servi en `max-age=0, must-revalidate`.

Le comportement a été vérifié sur un Caddy 2 réel, en plaçant le `header` sans matcher avant
puis après les règles spécifiques : il l'emporte **dans les deux cas**. Ce n'est donc pas une
question d'ordre, et aucun réordonnancement ne corrige le défaut — il faut rendre les matchers
mutuellement exclusifs, d'où le `@reste not path …`. Rien dans les journaux ne le signale, et
`caddy validate` accepte les deux versions.

Conséquence pratique tant que le défaut était en place : chaque chargement de page revalidait
les 2,6 Mio de `vendor/` et la scène courante, fichier par fichier. Les réponses étaient des
`304` — la bande passante était donc préservée — mais la latence d'une requête conditionnelle
par fichier était payée à chaque visite.

Vérification, après `docker compose up -d --build caddy` :

```bash
for f in index.html assets/scenes.json assets/scene.glb vendor/three.module.js; do
  printf '%-32s %s\n' "$f" \
    "$(curl -sI "http://localhost:8080/valleraugue-3d/$f" | grep -i '^cache-control')"
done
```

Attendu : `max-age=86400` sur le `.glb` et sur `vendor/`, `must-revalidate` sur `index.html`
et sur **tous** les `.json`, y compris ceux imbriqués dans `assets/scenes/<id>/`.

### CSP : autoriser les textures GLB en `blob:`

`GLTFLoader` extrait le JPEG embarqué dans le GLB sous forme d'URL `blob:`, puis Three.js le
charge avec `FileLoader`, donc avec `fetch`. Autoriser `blob:` dans `img-src` **ne suffit pas** :
il doit aussi être présent dans `connect-src`. Sans lui, la géométrie se charge mais le terrain
et les toitures restent sans orthophotographie, avec l'erreur
`Fetch API cannot load blob:... violates connect-src` dans la console.

La directive minimale requise est :

```caddy
connect-src 'self' blob: https://data.geopf.fr https://unpkg.com;
```

Les modules ES viennent de `vendor/` (`script-src 'self'`) et l'`importmap` inline est couvert
par `'unsafe-inline'`. Ne pas élargir davantage la CSP pour corriger un autre défaut.

**La carte géologique n'exige aucun élargissement**, et c'est à savoir avant de toucher à la
directive « au cas où ». Ses trois fichiers sont servis depuis la même origine : la texture
passe par un `<img>` que couvre `img-src 'self'`, la légende et la carte d'identifiants par un
`fetch` que couvre `connect-src 'self'`. Le `createImageBitmap` opère sur un blob déjà en
mémoire, sans requête, et la lecture des identifiants dans un `<canvas>` ne relève pas de la
CSP mais de la même origine — que la publication respecte par construction.

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
# Sorties du POC 3D (plusieurs Go) : servies par un volume runtime, jamais dans un contexte
# de build.
poc/**/output*/
poc/**/publication/
poc/**/.venv/
poc/**/.work*/
```

Ce point vaut d'être corrigé indépendamment de la publication : `poc/valleraugue-mairie-3d`
pèse **8,8 Go** au 2 août 2026 — les `output-*/` de neuf scènes, dont ce document annonçait
encore 1,0 Go — et rien ne l'exclurait du contexte envoyé au démon Docker à chaque
`docker compose build caddy`. Vérifier que les quatre entrées sont bien présentes avant tout
`--build` : leur absence ne provoque pas d'erreur, seulement plusieurs minutes d'attente.

### Une seule source, y compris derrière Nginx

Sur le serveur public, Nginx termine HTTPS mais ne doit pas servir une seconde copie sous
`/var/www`. Cette copie divergerait dès la publication suivante. La route publique transmet
le chemin inchangé au port Caddy publié :

```nginx
location /valleraugue-3d/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Après modification : `nginx -t` puis `systemctl reload nginx`. Les URL publique et tailnet
doivent alors rendre les mêmes empreintes pour `index.html`, `app.js`, `assets/scenes.json`
et `assets/scene.glb`.

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
| `curl -s .../assets/scenes.json` | autant d'entrées que de scènes publiées, la plus légère en premier, titres deux à deux distincts |
| `curl -sI .../assets/scenes.json` | `Cache-Control: …must-revalidate` — **pas** `max-age=86400` (§ 4) |
| `curl -sI .../assets/scene.glb` | `Cache-Control: public, max-age=86400` |
| `curl -I .../favicon.svg` | `200`, `Content-Type: image/svg+xml` |
| `curl -sI -H 'Accept-Encoding: gzip' .../assets/geology.png` | `200`, `Content-Encoding: gzip`, `Content-Type: image/png` |
| `curl -s .../assets/geology.json` | `source`, `scale`, `retrievedAt` et une liste `formations` non vide |
| `curl -I .../` puis lecture de `Content-Security-Policy` | `connect-src 'self' blob:` |
| Navigateur, console ouverte | scène 200 m chargée, **aucune** erreur CSP ni 404 |
| Bascule « Carte géologique BRGM » | la carte se drape, la légende se remplit, le clic nomme la formation — sans erreur CSP |
| Sélecteur de scènes | bascule vers chaque autre scène et retour, sans erreur ; le titre de l'en-tête et l'onglet suivent |
| Dialogue « Informations sur les données » | section licence présente |
| `curl -I --path-as-is '.../assets/../../etc/passwd'` | pas d'évasion hors de `/srv/valleraugue-3d` |

Deux lignes de ce tableau méritent leur justification, parce qu'une rédaction plus naturelle
ne vérifie rien :

- **`curl -s`, pas `curl -I`, sur `scenes.json`.** `-I` émet un `HEAD` : il n'y a pas de corps,
  donc aucune entrée à compter. La version précédente de cette recette demandait de compter
  des entrées dans une réponse vide.
- **`--path-as-is` sur le test d'évasion.** Sans lui, curl résout `..` **côté client** et
  envoie une requête déjà normalisée : le serveur ne voit jamais la traversée, et le test
  réussit quoi qu'il arrive. Viser hors de la racine (`../../etc/passwd`), pas un fichier qui
  existe à l'intérieur.

Rendre compte de la publication en indiquant l'URL servie, les scènes publiées avec leur run
(`run-AAAAMMJJ-HHMMSS`) et le volume monté, puis proposer le commit des seules modifications
versionnées : `Caddyfile`, `docker-compose.yml`, `.dockerignore` et ce document. Le contenu de
`publication/` ne fait **jamais** partie du commit.

### État au 2 août 2026

| Élément | État |
| --- | --- |
| Mention de licence dans le dialogue (§ 6) | **en place** |
| `publication/` dans le `.gitignore` du POC (§ 3) | **en place** |
| Route `/valleraugue-3d` dans le `Caddyfile` (§ 4) | **en place** |
| Volume dans le `docker-compose.yml` (§ 5) | **en place** |
| Entrées `poc/**` dans le `.dockerignore` (§ 5) | **en place** |
| Nginx public en proxy vers Caddy (§ 5) | **en place** |
| CSP `connect-src ... blob:` et favicon | **en place** |
| CSP pour la carte géologique (§ 4) | **rien à faire** — même origine, couverte par `'self'` |
| `Cache-Control` sur `/assets/*` et `/vendor/*` (§ 4) | **corrigé le 2 août** — les règles étaient écrasées par un `header` sans matcher |
| Scènes assemblées | **neuf** : Valleraugue 100 m, 200 m et 600 m, Notre-Dame-de-la-Rouvière 200 m, Creyssensac-et-Pissot 200 m, Col de Perjuret 600 m, Chaos de Nîmes-le-Vieux 500 m, Gorges de la Jonte 500 m, Mont Aigoual 500 m |
| Carte géologique BRGM | produite pour les neuf, sur trois départements (030 Gard, 048 Lozère, 024 Dordogne) |
| Volume de `publication/` | **405 Mio**, 137 fichiers |
| Titres du manifeste | **9 entrées, 7 titres distincts** — `poc`, `poc-200m` et `poc-600m` s'appellent tous « Valleraugue » (§ 2, contrôle 4) |

Contrairement à ce qu'affirmaient les rédactions précédentes, `poc.conf` — l'emprise 100 m
historique — **est** assemblée et **entre bien** dans le manifeste, en dernière position. Ce
tableau vieillit vite : l'état réel se relit en une commande — `curl -s .../assets/scenes.json`
en ligne, ou la sortie de `poc.py web`, qui énumère les scènes proposées au sélecteur.

Le visualiseur est en ligne. Caddy est l'unique source des fichiers ; Nginx ne fait que
relayer la route publique.

## 8. Mettre à jour une publication existante

La route Caddy, le volume monté et le `.dockerignore` sont posés une fois pour toutes. Une
mise à jour ne rejoue que ce que le changement impose.

| Ce qui a changé | Étapes à rejouer |
| --- | --- |
| Le visualiseur (`viewer/index.html`, `app.js`, `styles.css`, `favicon.svg`) | § 2 → § 3 → transfert → § 7 |
| Une scène existante réassemblée (`poc.py all`) | § 2 → § 3 → transfert → § 7 |
| **Une scène ajoutée** (`poc.py scene` puis étape amont puis `poc.py all`) | § 2 → § 3 → transfert → § 7, en contrôlant le volume total et l'ordre du manifeste |
| Le `Caddyfile` ou le `docker-compose.yml` | `docker compose up -d --build caddy`, puis § 7 |
| La route Nginx publique | `nginx -t`, `systemctl reload nginx`, puis comparaison des empreintes publique/tailnet |
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
2. **Vérifier le volume.** Une scène 200 m ajoute une vingtaine de mébioctets au dossier
   publié ; une 500 ou 600 m, de 35 à 100 Mio. Multiplier par 1,34 pour le volume réellement
   transféré, `.gz` compris. `du -sh publication` avant d'envoyer.
3. **Vérifier les titres, et leur unicité.** Chaque entrée de `assets/scenes.json` doit porter
   un `title`, et deux entrées ne doivent pas porter le même : le sélecteur n'affiche rien
   d'autre, et trois « Valleraugue » y sont aujourd'hui indiscernables. Le titre vient de
   `SCENE_TITLE` dans le `.conf` de la scène ; y faire figurer l'emprise lève l'ambiguïté.
   Le contrôle est au § 2.

### Ce qu'il ne faut pas refaire

- **Ne pas remonter le volume ni retoucher le `Caddyfile`** pour une simple mise à jour de
  contenu : le chemin `publication/` est stable précisément pour ça.
- **Ne pas transférer un `web/` qu'on n'a pas régénéré soi-même** à l'étape § 2. C'est le
  piège le plus coûteux du lot : un `web/` datant d'une exécution précédente remet en ligne
  une ancienne interface, avec un `scenes.json` amputé des scènes ajoutées depuis, et **rien
  ne le signale**.
- **Ne pas effacer `publication/` sur le serveur** avant d'avoir reçu le remplaçant en entier :
  la bascule se fait fichier par fichier, dossier d'attente à l'appui.
- **Ne pas recopier le visualiseur sous `/var/www`** : Nginx relaie Caddy, qui doit rester
  l'unique source de vérité.

## 9. Interdits

- Aucune ressource externe : pas de CDN, pas de police distante, pas de mesure d'audience, pas
  de carte de fond en ligne. L'autonomie du dossier est ce qui rend la CSP tenable.
- Ne pas versionner les GLB, les `.gz`, ni le dossier `publication/`.
- Ne pas assouplir la CSP au-delà du contrat documenté au § 4. `blob:` est requis dans
  `img-src` **et** `connect-src` pour les textures embarquées ; le reste doit rester fermé.
- Ne pas altérer les mentions de traçabilité existantes du dialogue, hors ajout de la licence.
- Ne pas déployer un `web/` que l'on n'a pas régénéré soi-même à l'étape § 2.
