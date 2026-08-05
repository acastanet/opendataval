# Transférer le visualiseur vers le serveur avec Tailscale

## Objet et périmètre

[`publication-visualiseur.md`](publication-visualiseur.md) décrit **quoi** publier — un
dossier statique autonome — et **comment le servir** — une route Caddy et un volume monté.
Il laisse un trou entre les deux : le dossier est produit sur le poste Windows, et le
serveur est ailleurs. Ce document comble ce trou.

Le transfert porte sur un dossier de **405 Mio** au 2 août 2026 — neuf scènes, 137 fichiers —
dont l'essentiel tient dans neuf fichiers GLB. Il est répété à chaque nouvelle scène ou
correction du visualiseur. Tailscale est ce qui permet de le faire sans exposer SSH sur
Internet, sans ouvrir de port sur la box, et sans passer par un dépôt de fichiers
intermédiaire.

Ce volume croît vite : les rédactions précédentes de ce document raisonnaient sur 81 Mo, soit
cinq fois moins. Tout arbitrage entre les méthodes ci-dessous se relit à l'aune du volume du
jour, que `du -sh publication` donne en une commande.

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

### Multiplexer les connexions SSH

Une publication ouvre cinq à six connexions SSH : relevé du chemin cible, transfert,
vérification distante, bascule, `du` final, parfois un `docker compose`. Chacune repaie la
négociation complète. Une fois pour toutes, dans `~/.ssh/config` du poste :

```sshconfig
Host <serveur>
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 10m
```

La première connexion ouvre le canal, les suivantes le réutilisent et s'établissent
instantanément. Sur un tailnet où la latence est déjà celle du relais, c'est le réglage le
plus rentable du document.

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

Précompresser avant de transférer, jamais après : les `.gz` divisent le volume par trois à
l'usage et ce sont eux que Caddy servira via `precompressed`. Compresser sur le poste évite
de le faire sur le serveur, qui n'a pas forcément le CPU pour.

**La commande de précompression n'est pas reproduite ici** : elle est au § 3 de
[`publication-visualiseur.md`](publication-visualiseur.md), avec ses mesures. Deux variantes
divergentes ont longtemps coexisté entre les deux documents, dont une prescrivait `gzip -9` —
plus lent *et* produisant un fichier plus gros sur ces GLB : 16,03 s contre 2,60 s sur la
scène 600 m, pour 297 Ko de plus. Utiliser `-6`, et une seule source.

Conséquence à connaître pour le transfert : chaque fichier part **avec son `.gz`**, puisque
`precompressed` exige les deux côte à côte. Sur la publication du jour, cela fait 302,6 Mio
d'originaux plus 102,7 Mio de versions compressées, soit **405 Mio envoyés pour 302,6 Mio
utiles — 34 % de surcoût**. C'est assumé, et c'est exactement ce que le différentiel de
`rsync` (§ 4) annule sur les publications de routine.

**Ne jamais transférer `output*/`, `.work-python/` ni `.venv/`.** Les `output-*/` des neuf
scènes portent à eux seuls le POC à **8,8 Gio** ; les deux autres n'ont aucun sens sur le
serveur.

Le dossier contient aussi `favicon.svg`. Il n'est pas précompressé, mais doit être transféré
avec le reste : `index.html` le référence explicitement afin d'éviter la requête implicite
et erronée vers `/favicon.ico`.

## 3. Le chemin cible se lit, il ne se devine pas

Cette étape précède **toutes** les méthodes de transfert et se fait une fois par session.

Le dossier à remplacer est celui que le conteneur Caddy monte sur `/srv/valleraugue-3d`, et
son emplacement dépend de l'installation : nom du dépôt cloné, compte qui l'héberge, casse
retenue. **Se tromper de chemin ne se voit pas.** Le transfert réussit, `du -sh` affiche un
volume plausible, la recette locale passe — et le site continue de servir l'ancienne
publication depuis un dossier que l'on n'a jamais touché, pendant qu'une arborescence
fantôme s'accumule à côté. Relever le chemin sur le montage :

```bash
# Git Bash, depuis poc/valleraugue-mairie-3d
set -o pipefail
serveur=<utilisateur>@<serveur>
cible=$(ssh "$serveur" 'docker inspect -f "{{range .Mounts}}{{if eq .Destination \"/srv/valleraugue-3d\"}}{{.Source}}{{end}}{{end}}" $(docker ps -q --filter name=caddy)')
cible=${cible%/publication}

if [ -z "$cible" ]; then
  echo 'ARRET : montage /srv/valleraugue-3d introuvable — Caddy tourne-t-il ?' >&2
elif [ "$(printf '%s' "$cible" | wc -l)" -gt 0 ]; then
  echo "ARRET : plusieurs conteneurs correspondent, chemins concatenes :" >&2
  printf '%s\n' "$cible" >&2
  cible=
else
  echo "cible : $cible"
fi
```

**Un résultat vide est un arrêt, pas un avertissement.** La rédaction précédente se contentait
d'un `echo` et laissait la suite s'exécuter : avec `$cible` vide, les commandes du § 5
devenaient `rm -rf "/publication.incoming"` et `mkdir -p "/publication.incoming"` — à la racine
du serveur. D'où le `if`, et le `cible=` explicite dans la branche multi-lignes.

Le second cas n'est pas théorique : `--filter name=caddy` retient tout conteneur dont le nom
contient `caddy`, et `docker inspect` concatène alors les chemins de tous. Le résultat
ressemble à un chemin valide et n'en est pas un.

Vérifier, avant d'aller plus loin, que `$cible` est bien renseigné — les sections suivantes le
supposent, ainsi que `$serveur` :

```bash
[ -n "$cible" ] || echo 'ne pas continuer' >&2
ssh "$serveur" "ls -d \"$cible/publication\""
```

## 4. Méthode retenue — `rsync` sur le tailnet

`rsync` ne transfère que ce qui a changé. Sur une publication de routine où seul `app.js` a
bougé, cela fait **quelques dizaines de kilooctets au lieu de 405 Mio** ; sur une scène
ajoutée, le poids de cette seule scène. Il gère aussi la reprise et la bascule différée, que
la méthode du § 5 doit reconstituer à la main. C'est la méthode par défaut dès qu'il est
disponible.

### Le trouver : ni Git Bash, ni Windows

`rsync` n'est **pas** livré avec Git Bash — la commande y répond `command not found`. Il l'est
avec WSL (`apt install rsync`) et avec MSYS2. Deux différences comptent, et aucune n'est
signalée par un message clair :

- **Les chemins.** Depuis WSL, le dossier n'est pas `publication/` mais
  `/mnt/c/DEV_ALX/OpenDataVdA/poc/valleraugue-mairie-3d/publication`. Un chemin relatif
  hérité d'un terminal Git Bash pointe ailleurs, ou nulle part.
- **Le trousseau SSH.** WSL a son propre `~/.ssh`, distinct de celui de Windows OpenSSH : la
  clé utilisée au § 3 n'y est pas, et `ControlMaster` non plus. Copier la clé dans le `~/.ssh`
  de WSL, ou y refaire un `ssh-copy-id`. Tester par un `ssh "$serveur" true` **depuis WSL**
  avant de lancer le transfert.

Tailscale, lui, ne demande rien de particulier : l'interface est celle de l'hôte Windows et
WSL l'emprunte.

### Transfert différentiel

```bash
# Depuis WSL, dans le dossier du POC
rsync -a --delete --delay-updates --partial-dir=.rsync-partial \
      --info=progress2 --human-readable \
      publication/ "$serveur:$cible/publication/"
```

- `--delay-updates` garde les fichiers reçus de côté et ne les met en place qu'à la fin : la
  publication bascule d'un bloc plutôt que fichier par fichier.
- `--delete` retire du serveur les fichiers disparus de la source — ce que la méthode du § 5
  ne fait pas. **À n'utiliser qu'avec la barre oblique finale sur les deux chemins** : sans
  elle, `rsync` crée un sous-dossier `publication/publication/` et efface ce qu'il ne faut pas.
- `--partial-dir` permet de reprendre un transfert coupé sans repartir de zéro. `rsync`
  l'exclut automatiquement de la synchronisation, il n'apparaîtra pas côté serveur.
- `--info=progress2` donne une progression globale, utile sur 405 Mio.
- **Ne pas ajouter `-z`.** Les GLB et leurs `.gz` sont déjà compressés ; la compression du
  flux coûte du CPU des deux côtés pour un gain nul.
- `-a` plutôt que `-av` : la liste des 137 fichiers n'apprend rien que `--info=progress2` ne
  dise mieux. Utiliser `-av` pour diagnostiquer, pas en routine.

Essai à blanc avant le premier transfert d'une session, pour vérifier chemins et volume :

```bash
rsync -a --delete --dry-run --stats publication/ "$serveur:$cible/publication/" | tail -20
```

Si `--dry-run` annonce la suppression de fichiers que l'on croyait en ligne, ou un volume
proche du total, c'est que la barre oblique finale ou le chemin cible est faux. **Ne pas
relancer sans `--dry-run` avant d'avoir compris.**

### Bascule et intégrité

`--delay-updates` fait la bascule, et `rsync` vérifie de lui-même chaque fichier transféré par
somme de contrôle glissante — le contrôle `sha256sum` du § 5 est ici redondant. La reprise via
`--partial-dir` est le seul cas qui mérite une vérification a posteriori, et une passe
`rsync -ac --dry-run` la donne : elle relit les deux côtés et n'annonce que ce qui diffère
réellement.

```bash
rsync -ac --dry-run --itemize-changes publication/ "$serveur:$cible/publication/"
```

Aucune ligne en sortie signifie que les deux arborescences sont identiques, contenu compris.

## 5. Repli — archive `tar` par SSH

Quand `rsync` n'est disponible ni par WSL ni par MSYS2 : une seule connexion, un seul flux,
aucun outil à installer. `tar` est dans Git Bash, `ssh` dans Windows. Le dossier est empaqueté
à la volée et déballé dans un dossier d'attente sur le serveur, puis basculé. Le coût est
qu'il renvoie **tout** à chaque fois.

### Transfert intégral

```bash
set -o pipefail
tar -cf - -C publication . \
  | ssh "$serveur" "cible=\"$cible\"; "'set -e
       rm -rf "$cible/publication.incoming"
       mkdir -p "$cible/publication.incoming"
       tar -xf - -C "$cible/publication.incoming"
       echo "reçu : $(du -sh "$cible/publication.incoming" | cut -f1)"'
```

**Le `set -o pipefail` n'est pas décoratif.** Sans lui, le pipeline rend le code de sortie de
`ssh` : un `tar` local interrompu — disque plein, fichier illisible, session fermée — laisse un
dossier d'attente tronqué et affiche un « reçu : … » parfaitement rassurant. Le `set -e` de la
partie droite ne protège que le côté serveur.

Le mélange de guillemets est délibéré : la portion entre guillemets doubles interpole `$cible`
**sur le poste**, celle entre guillemets simples est transmise telle quelle au shell distant,
qui la relit avec sa propre valeur. Tout mettre entre guillemets doubles ferait évaluer
`$(du -sh …)` en local, sur un chemin qui n'y existe pas.

Sur une mise à jour qui n'ajoute qu'une scène, remplacer le `.` par la liste des seuls
chemins concernés évite d'envoyer les scènes déjà en ligne — quelques dizaines de mébioctets
au lieu de la publication entière. La bascule ci-dessous n'efface rien et s'en accommode :

```bash
tar -cf - -C publication assets/scenes.json assets/scenes.json.gz \
                         assets/scenes/<identifiant-de-la-scene> | …
```

C'est le rattrapage manuel de ce que `rsync` fait tout seul, et il faut penser à y joindre le
manifeste — l'oublier publie une scène que le sélecteur ne proposera pas.

L'archive n'est **pas** compressée par `tar` : les GLB et leurs `.gz` le sont déjà, et `-z`
sur 405 Mio de données pour l'essentiel incompressibles coûte du CPU des deux côtés pour rien.

### Bascule, sans servir un fichier à moitié copié

Le dossier `publication/` est monté en volume dans le conteneur Caddy. **Le remplacer par un
`mv` casserait le montage** : Docker lie le point de montage à l'inode du dossier au
démarrage du conteneur, et le conteneur continuerait de voir l'ancien. Il faut donc déplacer
les *fichiers*, pas le dossier.

Contrôler d'abord ce qui a été reçu, pendant que c'est encore à l'écart : un GLB tronqué se
rattrape dans le dossier d'attente, pas après la bascule.

```bash
# Poste — les mêmes chemins que ceux passés à `tar` ; `.` pour une publication entière
(cd publication && find . -type f -exec sha256sum {} +) \
  | sed 's/^\([0-9a-f]*\) [ *]/\1  /' | sort > /tmp/poste.sha
# Serveur
ssh "$serveur" "cd \"$cible/publication.incoming\" && find . -type f -exec sha256sum {} +" \
  | sed 's/^\([0-9a-f]*\) [ *]/\1  /' | sort > /tmp/serveur.sha
diff /tmp/poste.sha /tmp/serveur.sha \
  && echo "intégrité vérifiée : $(wc -l < /tmp/poste.sha) fichiers"
```

**Comparer le nom *et* l'empreinte.** La rédaction précédente coupait le nom (`cut -d' ' -f1`)
pour contourner une différence de format : `sha256sum` de Git Bash préfixe le nom d'un `*` en
mode binaire là où celui du serveur met deux espaces. Mais comparer deux ensembles
d'empreintes triés ne détecte ni un fichier arrivé au mauvais chemin, ni deux fichiers
permutés. Le `sed` normalise le séparateur et permet de garder les noms.

```bash
ssh "$serveur" "cible=\"$cible\"; "'set -e
   mkdir -p "$cible/publication"
   cd "$cible/publication.incoming"
   find . -type d -exec mkdir -p "$cible/publication/{}" \;
   # Le rename est atomique dans un même système de fichiers : aucun visiteur ne peut
   # récupérer un GLB tronqué, seulement la version précédente ou la nouvelle.
   # Les manifestes passent en dernier — voir ci-dessous.
   find . -type f ! -name "*.json" ! -name "*.json.gz" \
     -exec mv -f {} "$cible/publication/{}" \;
   find . -type f \( -name "*.json" -o -name "*.json.gz" \) \
     -exec mv -f {} "$cible/publication/{}" \;
   cd - >/dev/null
   rm -rf "$cible/publication.incoming"
   echo "publié : $(du -sh "$cible/publication" | cut -f1)"'
```

**L'atomicité vaut par fichier, pas pour l'ensemble.** Chaque `mv` est un rename atomique, donc
personne ne récupère un GLB à moitié écrit ; mais pendant les quelques secondes de la boucle,
un visiteur peut très bien recevoir le nouveau `scenes.json` et l'ancien `scene.glb`. D'où les
deux passes : la géométrie d'abord, les manifestes ensuite. Le décalage devient alors
inoffensif — un manifeste ancien ne référence que des fichiers déjà en place.

Les fichiers d'une publication précédente qui ne sont plus produits restent en place. C'est
volontaire : ils ne sont référencés par aucun manifeste et ne coûtent que du disque, là où
un effacement automatique se tromperait un jour de dossier. C'est la différence avec le
`--delete` de `rsync` (§ 4), qui lui les retire.

## 6. Recharger Caddy

Le contenu est statique et servi depuis un volume : **aucun redémarrage n'est nécessaire**.
Ne reconstruire le conteneur que si le `Caddyfile` a changé. Le fichier est copié dans
l'image, donc un simple `up` réutiliserait l'ancienne CSP :

```bash
ssh "$serveur" "cd \"${cible%/poc/*}\" && docker compose up -d --build caddy"
```

La racine du dépôt se déduit du chemin relevé plus haut : c'est ce qui précède `poc/`. La
déduire plutôt que la saisir évite de reconstruire le conteneur depuis un clone voisin, qui
remonterait le volume sur un tout autre dossier.

Ce `--build` reconstruit aussi les fronts Astro de la même image : compter plusieurs minutes,
et ne le déclencher que si le `Caddyfile` a effectivement changé — `git log -1 --oneline
-- Caddyfile` sur le serveur tranche en une commande.

**À faire une fois** : le `Caddyfile` a changé le 2 août 2026 (règles `Cache-Control`,
cf. § 4 de [`publication-visualiseur.md`](publication-visualiseur.md)). Tant que ce `--build`
n'a pas été passé sur le serveur, le site en ligne sert encore l'ancienne configuration, dans
laquelle les directives de cache sur `/assets/*` et `/vendor/*` étaient sans effet.

Le point d'entrée public Nginx doit être un proxy vers ce Caddy, jamais une copie statique
distincte. La configuration et sa validation sont décrites au § 5 de
[`publication-visualiseur.md`](publication-visualiseur.md).

## 7. Dernier recours — Taildrop, sans SSH

Quand le serveur n'expose pas SSH, Taildrop transfère un fichier entre deux machines du
tailnet sans rien d'autre. Il ne prend **pas** d'arborescence : il faut empaqueter.

```bash
tar -cf publication.tar -C publication .
"/c/Program Files/Tailscale/tailscale.exe" file cp publication.tar "<serveur>:"
```

Puis, sur le serveur, récupérer et déballer. **Créer le dossier d'attente d'abord** : c'est
le pipeline du § 5 qui s'en chargeait, et le renvoi à cette section a longtemps laissé croire
que `tar` le créerait lui-même. Il échoue.

```bash
tailscale file get ~/incoming/
mkdir -p "$cible/publication.incoming"
tar -xf ~/incoming/publication.tar -C "$cible/publication.incoming"
```

La bascule et la vérification d'intégrité sont ensuite celles du § 5 — et ici le
`sha256sum` a toute sa valeur : Taildrop est le seul chemin du document où le fichier
transite par un support intermédiaire.

Taildrop dépose le fichier en entier ou pas du tout, mais il n'a ni reprise ni progression
utilisable sur **405 Mio** — cinq fois le volume pour lequel cette section a été écrite. C'est
un dépannage, et il devient franchement inconfortable à cette taille.

## 8. Prévisualiser avant de publier

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

## 9. Recette

Depuis une machine du tailnet, en remplaçant `<site-tailnet>` et `<site-public>` par les
hôtes servis :

| Vérification | Attendu |
| --- | --- |
| `ssh "$serveur" "ls \"$cible/publication\""` | `index.html`, `app.js`, `favicon.svg`, `assets/`, `vendor/` |
| `ssh "$serveur" "du -sh \"$cible/publication\""` | l'ordre de grandeur du `du -sh publication` local |
| `curl -I http://<site-tailnet>/valleraugue-3d` | `308` vers `/valleraugue-3d/` |
| `curl -sI -H 'Accept-Encoding: gzip' http://<site-tailnet>/valleraugue-3d/assets/scene.glb` | `Content-Encoding: gzip`, `Content-Type: model/gltf-binary` |
| `curl -s http://<site-tailnet>/valleraugue-3d/assets/scenes.json` | autant d'entrées que de scènes publiées, la plus légère en premier |
| `curl -sI http://<site-tailnet>/valleraugue-3d/assets/scenes.json` | `Cache-Control` en `must-revalidate` — sinon une scène ajoutée resterait invisible |
| `curl -sI -H 'Accept-Encoding: gzip' http://<site-tailnet>/valleraugue-3d/assets/geology.png` | `200`, `Content-Encoding: gzip` — sinon la précompression du § 2 a oublié les `.png` |
| `curl -sI https://<site-public>/valleraugue-3d/` | même CSP que Caddy, avec `connect-src 'self' blob:` |
| `curl -sI https://<site-public>/valleraugue-3d/favicon.svg` | `200`, `Content-Type: image/svg+xml` |
| Navigateur, console ouverte | scène chargée, sélecteur fonctionnel, aucune 404 ni erreur CSP |

Contrôler l'intégrité d'un GLB plutôt que sa seule taille :

```bash
# Poste
sha256sum publication/assets/scene.glb
# Serveur
ssh "$serveur" "sha256sum \"$cible/publication/assets/scene.glb\""
```

Ce contrôle ponctuel suffit après un transfert `rsync` (§ 4) ou `tar` (§ 5), qui n'ont pas de
reprise silencieuse : `rsync` vérifie chaque fichier qu'il écrit, et un `tar | ssh` coupé se
signale par le `set -o pipefail`. Relire les 405 Mio des deux côtés à chaque publication —
comme le demandaient les rédactions précédentes — coûte deux lectures complètes pour un
scénario que ces deux méthodes ne produisent pas. La vérification exhaustive garde son sens
après une reprise `--partial-dir` et après un passage par Taildrop (§ 7).

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

## 10. Sécurité

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
  405 Mio reproductibles en une commande n'ont pas leur place dans l'historique Git.

## 11. Interdits

- Ne pas transférer un `web/` qu'on n'a pas régénéré soi-même — un dossier périmé met en
  ligne une ancienne interface sans que rien ne le signale.
- Ne pas supposer le chemin de `publication/` sur le serveur, ni le recopier d'une session
  précédente : le lire sur le montage du conteneur Caddy (§ 3). Une erreur de chemin publie
  dans le vide en rendant compte d'un succès.
- **Ne pas poursuivre avec un `$cible` vide ou multi-lignes** (§ 3). Les commandes du § 5
  s'exécuteraient alors à la racine du serveur, `rm -rf` compris.
- Ne pas remplacer le dossier `publication/` par un `mv` sur le serveur : le montage Docker
  suit l'inode, et le conteneur continuerait de servir l'ancien contenu (§ 5).
- Ne pas copier directement dans `publication/` sans dossier d'attente : un visiteur
  récupérerait un GLB tronqué pendant les quelques minutes du transfert.
- Ne pas lancer `rsync --delete` sans avoir vu passer un `--dry-run`, ni sans la barre
  oblique finale sur les **deux** chemins (§ 4).
- Ne pas ajouter `-z` à `rsync` ni `-z` à `tar` : le contenu est déjà compressé.
- Ne pas maintenir une seconde copie sous `/var/www` : elle divergerait du volume Caddy dès
  la publication suivante.
- Ne pas synchroniser `output*/`, `.work-python/` ni `.venv/`.
