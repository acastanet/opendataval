# Transférer le visualiseur vers le serveur avec Tailscale

## Objet et périmètre

[`publication-visualiseur.md`](publication-visualiseur.md) décrit **quoi** publier — un
dossier statique autonome — et **comment le servir** — une route Caddy et un volume monté.
Il laisse un trou entre les deux : le dossier est produit sur le poste Windows, et le
serveur est ailleurs. Ce document comble ce trou.

Le transfert porte sur un dossier de **81 Mo à plusieurs centaines de mégaoctets** selon les
scènes retenues, dont l'essentiel tient dans deux ou trois fichiers GLB. Il est répété à
chaque nouvelle scène ou correction du visualiseur. Tailscale est ce qui permet de le faire
sans exposer SSH sur Internet, sans ouvrir de port sur la box, et sans passer par un dépôt
de fichiers intermédiaire.

**Hors périmètre :** la chaîne d'enrichissement et l'étape amont. Ce document déplace les
octets et vérifie que les deux points d'entrée — Caddy sur le tailnet et Nginx en public —
lisent ensuite la même publication.

## 1. Prérequis

| Sur | Quoi |
| --- | --- |
| Poste Windows | Tailscale (1.98 ou plus récent), Git Bash, OpenSSH client (`ssh`, `scp` — livrés avec Windows 10+) |
| Serveur | Tailscale, un compte disposant du droit d'écrire dans le dépôt, Docker et la pile déjà en place |
| Les deux | **le même tailnet**, MagicDNS activé |

Contrôler que les deux machines se voient avant tout le reste :

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" status
```

Chaque machine du tailnet apparaît avec son nom MagicDNS et son adresse `100.x.y.z`. Le nom
du serveur est ce qui remplace `<serveur>` dans tout ce qui suit ; il se termine par le nom
du tailnet, par exemple `<serveur>.<tailnet>.ts.net`. Ces valeurs **ne sont pas écrites dans
ce document** : un nom de machine et une adresse de tailnet décrivent une infrastructure
privée et n'ont rien à faire dans un dépôt.

Si `status` répond `Tailscale is starting` ou `NoState`, le service démarre encore ou la
machine n'est pas connectée : `tailscale up` puis reprendre.

## 2. Ce que l'on transfère

Le dossier `publication/`, produit par les § 2 et 3 de
[`publication-visualiseur.md`](publication-visualiseur.md) — dont le § 8 dit lesquelles de ces
étapes rejouer selon ce qui a changé :

```powershell
.\.venv\Scripts\python.exe poc.py --config config\poc-200m.conf web
$source = Resolve-Path .\output-200m\run-*\web | Select-Object -Last 1
Remove-Item -Recurse -Force .\publication -ErrorAction SilentlyContinue
Copy-Item -Recurse $source .\publication
```

Précompresser avant de transférer, jamais après : les `.gz` divisent le volume par trois et
ce sont eux que Caddy servira via `precompressed`. Compresser sur le poste évite de le faire
sur le serveur, qui n'a pas forcément le CPU pour.

```bash
# Git Bash, depuis poc/valleraugue-mairie-3d/publication
find . \( -name '*.glb' -o -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' \) \
  -exec gzip -9 -k -f {} +
```

**Ne jamais transférer `output*/`, `.work-python/` ni `.venv/`.** Le premier pèse près d'un
gigaoctet, les deux autres n'ont aucun sens sur le serveur.

Le dossier contient aussi `favicon.svg`. Il n'est pas précompressé, mais doit être transféré
avec le reste : `index.html` le référence explicitement afin d'éviter la requête implicite
et erronée vers `/favicon.ico`.

## 3. Méthode retenue — archive par SSH sur le tailnet

Une seule connexion, un seul flux, aucun outil à installer : `tar` est dans Git Bash, `ssh`
dans Windows. Le dossier est empaqueté à la volée et déballé dans un dossier d'attente sur
le serveur, puis basculé.

```bash
# Git Bash, depuis poc/valleraugue-mairie-3d
tar -cf - -C publication . | ssh <utilisateur>@<serveur> \
  'set -e
   cible=~/OpenDataVdA/poc/valleraugue-mairie-3d
   rm -rf "$cible/publication.incoming"
   mkdir -p "$cible/publication.incoming"
   tar -xf - -C "$cible/publication.incoming"
   echo "reçu : $(du -sh "$cible/publication.incoming" | cut -f1)"'
```

L'archive n'est **pas** compressée par `tar` : les GLB et leurs `.gz` le sont déjà, et
`-z` sur 81 Mo de données incompressibles coûte du CPU des deux côtés pour rien.

### Bascule, sans servir un fichier à moitié copié

Le dossier `publication/` est monté en volume dans le conteneur Caddy. **Le remplacer par un
`mv` casserait le montage** : Docker lie le point de montage à l'inode du dossier au
démarrage du conteneur, et le conteneur continuerait de voir l'ancien. Il faut donc déplacer
les *fichiers*, pas le dossier.

```bash
ssh <utilisateur>@<serveur> \
  'set -e
   cible=~/OpenDataVdA/poc/valleraugue-mairie-3d
   mkdir -p "$cible/publication"
   # Le rename est atomique dans un même système de fichiers : aucun visiteur ne peut
   # récupérer un GLB tronqué, seulement l'ancien ou le nouveau.
   (cd "$cible/publication.incoming" && find . -type d -exec mkdir -p "$cible/publication/{}" \;)
   (cd "$cible/publication.incoming" && find . -type f -exec mv -f {} "$cible/publication/{}" \;)
   rm -rf "$cible/publication.incoming"
   echo "publié : $(du -sh "$cible/publication" | cut -f1)"'
```

Les fichiers d'une publication précédente qui ne sont plus produits restent en place. C'est
volontaire : ils ne sont référencés par aucun manifeste et ne coûtent que du disque, là où
un effacement automatique se tromperait un jour de dossier.

### Recharger Caddy

Le contenu est statique et servi depuis un volume : **aucun redémarrage n'est nécessaire**.
Ne reconstruire le conteneur que si le `Caddyfile` a changé. Le fichier est copié dans
l'image, donc un simple `up` réutiliserait l'ancienne CSP :

```bash
ssh <utilisateur>@<serveur> 'cd ~/OpenDataVdA && docker compose up -d --build caddy'
```

Le point d'entrée public Nginx doit être un proxy vers ce Caddy, jamais une copie statique
distincte. La configuration et sa validation sont décrites au § 5 de
[`publication-visualiseur.md`](publication-visualiseur.md).

## 4. Variante — `rsync`, quand il est disponible

`rsync` n'est pas livré avec Git Bash, mais il l'est avec WSL et MSYS2. Quand il est là,
c'est le meilleur outil : seuls les fichiers modifiés partent, et sur une publication de
routine où seul `app.js` a bougé, le transfert tombe de 81 Mo à quelques kilooctets.

```bash
rsync -av --delete --delay-updates \
  --partial-dir=.rsync-partial \
  publication/ <utilisateur>@<serveur>:~/OpenDataVdA/poc/valleraugue-mairie-3d/publication/
```

- `--delay-updates` garde les fichiers reçus de côté et ne les met en place qu'à la fin :
  la publication bascule d'un bloc plutôt que fichier par fichier.
- `--delete` retire les fichiers disparus de la source, ce que la méthode du § 3 ne fait
  pas. À n'utiliser qu'avec la barre oblique finale sur les deux chemins — sans elle,
  `rsync` crée un sous-dossier et efface ce qu'il ne faut pas.
- `--partial-dir` permet de reprendre un transfert coupé sans repartir de zéro.

## 5. Variante — Taildrop, sans SSH

Quand le serveur n'expose pas SSH, Taildrop transfère un fichier entre deux machines du
tailnet sans rien d'autre. Il ne prend **pas** d'arborescence : il faut empaqueter.

```bash
tar -cf publication.tar -C publication .
"/c/Program Files/Tailscale/tailscale.exe" file cp publication.tar "<serveur>:"
```

Puis, sur le serveur, récupérer et déballer comme au § 3 :

```bash
tailscale file get ~/incoming/
tar -xf ~/incoming/publication.tar -C ~/OpenDataVdA/poc/valleraugue-mairie-3d/publication.incoming
```

Taildrop dépose le fichier en entier ou pas du tout, mais il n'a ni reprise ni progression
utilisable sur 81 Mo. C'est un dépannage, pas la méthode courante.

## 6. Prévisualiser avant de publier

`tailscale serve` expose le serveur local du POC aux **seules machines du tailnet**, en
HTTPS et sans rien publier sur Internet. C'est le bon moyen de faire valider une scène par
la commune avant de la mettre en ligne.

```powershell
# Terminal 1 : le visualiseur, sur la boucle locale
.\.venv\Scripts\python.exe poc.py --config config\poc-200m.conf serve --no-open

# Terminal 2 : le rendre visible sur le tailnet
& "C:\Program Files\Tailscale\tailscale.exe" serve --bg 8000
& "C:\Program Files\Tailscale\tailscale.exe" serve status
```

L'URL rendue par `serve status` s'ouvre depuis n'importe quel appareil connecté au tailnet,
téléphone compris. Refermer ensuite :

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" serve --https=443 off
```

## 7. Recette

Depuis une machine du tailnet, en remplaçant `<site-tailnet>` et `<site-public>` par les
hôtes servis :

| Vérification | Attendu |
| --- | --- |
| `ssh <utilisateur>@<serveur> 'ls ~/OpenDataVdA/poc/valleraugue-mairie-3d/publication'` | `index.html`, `app.js`, `favicon.svg`, `assets/`, `vendor/` |
| `curl -I http://<site-tailnet>/valleraugue-3d` | `308` vers `/valleraugue-3d/` |
| `curl -sI -H 'Accept-Encoding: gzip' http://<site-tailnet>/valleraugue-3d/assets/scene.glb` | `Content-Encoding: gzip`, `Content-Type: model/gltf-binary` |
| `curl -s http://<site-tailnet>/valleraugue-3d/assets/scenes.json` | autant d'entrées que de scènes publiées, la plus légère en premier |
| `curl -sI https://<site-public>/valleraugue-3d/` | même CSP que Caddy, avec `connect-src 'self' blob:` |
| `curl -sI https://<site-public>/valleraugue-3d/favicon.svg` | `200`, `Content-Type: image/svg+xml` |
| Navigateur, console ouverte | scène chargée, sélecteur fonctionnel, aucune 404 ni erreur CSP |

Contrôler l'intégrité d'un GLB plutôt que sa seule taille — un transfert coupé peut rendre
un fichier de la bonne longueur si la reprise s'est mal passée :

```bash
# Poste
sha256sum publication/assets/scene.glb
# Serveur
ssh <utilisateur>@<serveur> 'sha256sum ~/OpenDataVdA/poc/valleraugue-mairie-3d/publication/assets/scene.glb'
```

Enfin, comparer les deux chemins de service. Les quatre empreintes doivent être identiques ;
sinon Nginx sert encore une ancienne copie sous `/var/www` :

```bash
for site in "https://<site-public>/valleraugue-3d" \
            "http://<site-tailnet>/valleraugue-3d"; do
  echo "$site"
  for fichier in index.html app.js assets/scenes.json assets/scene.glb; do
    curl -fsS "$site/$fichier" | sha256sum
  done
done
```

## 8. Sécurité

- **Aucune clé d'authentification Tailscale dans le dépôt.** Ni `tskey-…` dans un script, ni
  dans un `.env` versionné, ni dans une commande documentée. L'appairage se fait à la main
  une fois par machine.
- **Restreindre l'accès par ACL** plutôt que par obscurité : le poste de publication n'a
  besoin que du port 22 du serveur. Une ACL Tailscale le dit mieux qu'un pare-feu local.
- **Ne pas ouvrir le site avec `tailscale funnel`.** Funnel expose une machine du tailnet
  sur l'Internet public, court-circuitant le frontal Nginx. Le chemin public retenu est
  Nginx → Caddy → volume `publication/`.
- **Ne pas mettre d'adresse `100.x.y.z` ni de nom `*.ts.net` dans le `Caddyfile`**, le
  `docker-compose.yml` ou ce dépôt : le tailnet est un chemin d'administration, pas une
  dépendance du service.
- **Le contenu de `publication/` n'est jamais versionné**, avant comme après transfert :
  81 Mo reproductibles en une commande n'ont pas leur place dans l'historique Git.

## 9. Interdits

- Ne pas transférer un `web/` qu'on n'a pas régénéré soi-même — un dossier périmé met en
  ligne une ancienne interface sans que rien ne le signale.
- Ne pas remplacer le dossier `publication/` par un `mv` sur le serveur : le montage Docker
  suit l'inode, et le conteneur continuerait de servir l'ancien contenu (§ 3).
- Ne pas copier directement dans `publication/` sans dossier d'attente : un visiteur
  récupérerait un GLB tronqué pendant les quelques minutes du transfert.
- Ne pas maintenir une seconde copie sous `/var/www` : elle divergerait du volume Caddy dès
  la publication suivante.
- Ne pas synchroniser `output*/`, `.work-python/` ni `.venv/`.
