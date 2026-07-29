# Publication du visualiseur — instructions d'exécution

## Objet et périmètre

Ce document est le brief de l'agent qui **publie le visualiseur** du POC sur l'infrastructure
Caddy d'OpenDataVdA. Le périmètre est le site web et lui seul : le visualiseur est un dossier
statique déjà produit par `poc.py web`, et la publication consiste à le servir, pas à le
recalculer.

**Hors périmètre, à ne pas toucher :**

- la chaîne d'enrichissement Python (`src/poc3d/`, `poc.py`) et ses tests — le dossier à
  publier est une **sortie** de cette chaîne ;
- l'étape amont LiDAR + Roofer ([`lidar-roofer.md`](lidar-roofer.md)) ;
- les autres routes du [`Caddyfile`](../../../Caddyfile) et les services du
  [`docker-compose.yml`](../../../docker-compose.yml).

Deux modifications du visualiseur lui-même sont en revanche **exigées avant la mise en ligne** :
la mention de licence (§ 6) est une obligation de réutilisation, pas une finition.

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
│   ├── scenes.json                 manifeste du sélecteur d'emprise
│   └── scenes/poc-600m/
│       ├── scene.glb   57,5 Mo   ← emprise 600 m
│       ├── scene.json
│       └── buildings.json 979 Ko
└── vendor/               2,3 Mo    Three.js 0.178.0 + addons (MIT)
```

Total mesuré : **81 Mo**. Décision retenue pour cette publication : **les deux emprises**, la
200 m en scène par défaut. L'ordre n'est pas cosmétique — la première scène du manifeste est
celle que le navigateur télécharge au chargement, et 23 Mo contre 57,5 Mo change l'expérience
du premier visiteur. La 600 m ne part que si l'on la choisit dans le sélecteur.

Le seul état conservé côté client est un `localStorage` de réglages d'affichage. Aucun cookie,
aucune mesure d'audience, aucune donnée personnelle : `buildings.json` ne porte que des
attributs BD TOPO publics (identifiants `cleabs`, hauteurs, dates, matériaux).

## 2. Produire le dossier à publier

Depuis `poc/valleraugue-mairie-3d`, avec le `.venv` du POC :

```powershell
.\.venv\Scripts\python.exe poc.py --config config\poc-200m.conf web
```

La configuration passée détermine la scène par défaut : `poc-200m.conf` place la 200 m en
première entrée et la 600 m en seconde. Ne pas préparer depuis `poc-600m.conf`, qui inverserait
les deux.

**Cette étape n'est pas facultative.** Les dossiers `web/` présents sur le poste peuvent
précéder les dernières modifications du visualiseur : au 30 juillet 2026,
`output-600m/run-20260729-225523/web/app.js` pesait 29 Ko contre 64 Ko pour
`viewer/app.js`. Publier un `web/` périmé met en ligne une ancienne interface sans que rien ne
le signale.

Contrôles à passer avant d'aller plus loin :

1. `assets/scenes.json` contient **deux** entrées, la 200 m d'abord ;
2. `index.html`, `app.js` et `styles.css` du dossier `web/` sont identiques à ceux de
   `viewer/` (comparer les tailles ou les empreintes) ;
3. les quatre `scene.glb` / `scene.json` référencés par le manifeste existent bien.

## 3. Figer un chemin de déploiement stable

Le dossier source est horodaté : le monter directement lierait Caddy à une exécution précise et
casserait la route à la préparation suivante. Copier le contenu vers un chemin fixe :

```powershell
$source = Resolve-Path .\output-200m\run-*\web | Select-Object -Last 1
Remove-Item -Recurse -Force .\publication -ErrorAction SilentlyContinue
Copy-Item -Recurse $source .\publication
```

Ajouter `publication/` au [`.gitignore`](../.gitignore) du POC. Les GLB **ne sont jamais
versionnés** : 81 Mo par publication dans l'historique Git, pour un artefact reproductible en
une commande, ne se justifie pas. Git LFS n'est pas une solution de repli ici.

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

## 6. Mention de licence — obligatoire avant mise en ligne

Le dialogue « Informations sur les données » détaille les sources IGN, les dates, l'emprise, la
méthode et les limites du modèle, mais **ne mentionne aucune licence**. En publication interne
c'était sans conséquence ; en ligne, la Licence Ouverte 2.0 sous laquelle l'IGN diffuse ces
données impose la mention de paternité.

À ajouter dans `viewer/app.js`, comme section supplémentaire du dialogue (suivre le style des
appels à `addDataSection`, et non un bloc HTML ad hoc dans `index.html`) :

- **Données** : « LiDAR HD, BD TOPO® et ORTHOPHOTOS® — © IGN, sous Licence Ouverte 2.0
  (Etalab). Réutilisation libre sous réserve de mention de la source. »
- **Logiciels** : Three.js 0.178.0 et Roofer, avec leurs licences respectives. Les fichiers de
  `vendor/` sont servis intacts, en-têtes de licence compris : ne pas les minifier.

Reprendre la préparation du § 2 après cette modification — le dossier `web/` embarque une copie
d'`app.js`, pas un lien vers lui.

## 7. Recette

Après `docker compose up -d caddy`, sur le port publié (`8080` en local) :

| Vérification | Attendu |
| --- | --- |
| `curl -I http://localhost:8080/valleraugue-3d` | `308` vers `/valleraugue-3d/` |
| `curl -I http://localhost:8080/valleraugue-3d/` | `200`, `text/html` |
| `curl -sI -H 'Accept-Encoding: gzip' .../assets/scene.glb` | `Content-Encoding: gzip`, `Content-Type: model/gltf-binary` |
| `curl -I .../assets/scenes.json` | `200`, deux entrées dans le corps |
| Navigateur, console ouverte | scène 200 m chargée, **aucune** erreur CSP ni 404 |
| Sélecteur d'emprise | bascule vers la 600 m et retour, sans erreur |
| Dialogue « Informations sur les données » | section licence présente |
| `curl -I .../assets/../index.html` | pas d'évasion hors de `/srv/valleraugue-3d` |

Rendre compte de la publication en indiquant l'URL servie, le run publié (`run-AAAAMMJJ-HHMMSS`)
et le volume monté, puis proposer le commit des seules modifications versionnées :
`Caddyfile`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `viewer/app.js` et ce
document. Le contenu de `publication/` ne fait pas partie du commit.

## 8. Interdits

- Aucune ressource externe : pas de CDN, pas de police distante, pas de mesure d'audience, pas
  de carte de fond en ligne. L'autonomie du dossier est ce qui rend la CSP tenable.
- Ne pas versionner les GLB, les `.gz`, ni le dossier `publication/`.
- Ne pas assouplir la CSP ni les entêtes de sécurité du site pour faire passer le visualiseur :
  s'il en a besoin, c'est le visualiseur qu'il faut corriger.
- Ne pas altérer les mentions de traçabilité existantes du dialogue, hors ajout de la licence.
- Ne pas déployer un `web/` que l'on n'a pas régénéré soi-même à l'étape § 2.
