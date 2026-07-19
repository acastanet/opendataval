# Consignes de mise à jour

Dernière vérification : 19 juillet 2026.

Ce guide décrit la mise à jour du dépôt `opendata-vda`, de ses dépendances et de
son déploiement Docker. Il complète `AGENT.md`. Toujours adapter les commandes à
l'environnement réel et ne jamais exposer les secrets de `.env`.

## État des déploiements

La mini-app Incendies est actuellement la partie déployée publiquement :

```text
URL publique : https://euporie.cloud/feu/
Route interne : /incendies/
```

Le nginx de l'hôte, hors de ce dépôt, réécrit `/feu/` vers le Caddy local sur
`/incendies/` et adapte les chemins des assets et de l'API. La configuration exacte
et les contrôles réalisés sont documentés dans
`doc/RAPPORT-INSTALLATION-INCENDIES.md`.

La mini-app Eau, sous `/eau/` et `/eau/tableau-de-bord/` dans le dépôt, est la
deuxième mini-app actuellement en développement. Ne pas supposer qu'elle est déjà
déployée sur `euporie.cloud` sans contrôle externe explicite.

Une mise à jour de la mini-app Feu doit préserver la compatibilité avec la
réécriture nginx `/feu`. Une mise à jour Eau ne doit pas être déployée
automatiquement avec Feu sans validation de son niveau de préparation.

## 1. Principes obligatoires

- Inspecter l'état Git avant toute opération.
- Ne jamais écraser, mettre de côté ou inclure des changements locaux sans accord.
- Utiliser des mises à jour Git en avance rapide (`--ff-only`).
- Sauvegarder PostgreSQL avant toute mise à jour d'un environnement persistant.
- Vérifier la sauvegarde avant de reconstruire ou redémarrer les services.
- Ne jamais supprimer les volumes Docker pour effectuer une mise à jour.
- Appliquer les migrations uniquement par le mécanisme automatique du projet.
- Vérifier les tests, le build, l'API et les pages après la mise à jour.
- Préparer un retour au commit applicatif précédent avant de commencer.

Commandes interdites sans demande explicite et sauvegarde vérifiée :

```text
git reset --hard
git clean -fd
docker compose down -v
docker volume rm
docker system prune --volumes
```

Une migration SQL déjà appliquée ne doit jamais être modifiée. Une évolution de
schéma passe par un nouveau fichier numéroté dans `db/migrations/`.

## 2. Mettre à jour une copie de travail

Depuis la racine du dépôt :

```bash
git status --short --branch
git remote -v
git fetch origin
git log --oneline HEAD..origin/master
git log --oneline origin/master..HEAD
```

Interprétation :

- si le statut contient des modifications ou fichiers non suivis inattendus,
  s'arrêter et décider avec leur propriétaire s'ils doivent être conservés,
  commités ou exclus ;
- si la branche locale contient des commits non poussés, ne pas tirer avant
  d'avoir compris leur relation avec la branche distante ;
- si la branche est propre et seulement en retard, poursuivre avec :

```bash
git pull --ff-only origin master
```

Ne pas utiliser un rebase, un merge automatique ou un stash pour contourner un
arbre sale sans autorisation explicite.

Après le pull, synchroniser les dépendances avec le lockfile :

```bash
pnpm install --frozen-lockfile
```

Si `pnpm` n'est pas directement disponible mais que Node et Corepack le sont :

```bash
corepack pnpm install --frozen-lockfile
```

Le projet attend pnpm 11.10.0, déclaré dans le champ `packageManager` du
`package.json` racine.

## 3. Vérifier une mise à jour locale

Exécuter au minimum :

```bash
pnpm check:incendies
git status --short --branch
```

`pnpm check:incendies` couvre les tests incendies API et worker, les vérifications
TypeScript correspondantes et le build Astro. Pour une modification hors du
périmètre incendies, compléter avec un contrôle fonctionnel adapté. Il n'existe pas
encore de suite de tests globale ni de commande lint.

Pour contrôler la configuration Docker sans démarrer les services :

```bash
docker compose config
```

Pour reconstruire et démarrer la stack locale :

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api worker caddy
```

Vérifications locales :

```bash
curl --fail --silent --show-error http://localhost:8080/api/health
curl --fail --silent --show-error http://localhost:8080/api/incendies/situation
```

Contrôler également dans un navigateur :

```text
http://localhost:8080/
http://localhost:8080/carte/
http://localhost:8080/eau/
http://localhost:8080/incendies/
http://localhost:8080/incendies/temps-reel/
```

## 4. Mettre à jour les dépendances

Une mise à jour du code avec le lockfile existant et une montée de versions sont
deux opérations différentes. Ne pas modifier les versions simplement pour faire
disparaître un avertissement.

Avant une montée de versions :

```bash
pnpm outdated -r
git status --short
```

Procédure recommandée :

1. choisir un paquet ou un groupe cohérent de paquets ;
2. lire les notes de version et changements incompatibles ;
3. mettre à jour les contraintes et `pnpm-lock.yaml` avec pnpm ;
4. vérifier les trois workspaces concernés ;
5. exécuter `pnpm check:incendies` et les contrôles fonctionnels ciblés ;
6. inspecter précisément `package.json` et `pnpm-lock.yaml` avant le commit ;
7. consacrer un commit distinct aux changements de dépendances importants.

Vigilances particulières :

- une mise à jour majeure d'Astro, Svelte, MapLibre, Fastify, PostgreSQL ou PostGIS
  est un changement d'architecture à valider ;
- les Dockerfiles utilisent des installations filtrées par workspace ; vérifier
  leurs builds après toute modification du graphe de dépendances ;
- ne pas régénérer les archives PMTiles lors d'une simple mise à jour de paquets.

## 5. Préparer une mise à jour d'un serveur

Le `Caddyfile` et le mappage `8080:80` du dépôt sont conçus pour la stack locale.
Sur `euporie.cloud`, HTTPS et le préfixe `/feu` sont gérés par le nginx déjà présent
sur l'hôte, qui reverse-proxy la stack sur `127.0.0.1:8080`. Ne pas remplacer cette
topologie par une configuration Caddy publique générique sans demande explicite.

Avant toute modification du serveur, relever :

```bash
cd /opt/opendataval
git rev-parse --short HEAD
git status --short --branch
docker compose ps
docker compose logs --since=1h --tail=200 api worker caddy
df -h
```

Noter le commit actuellement déployé : il constitue le premier point de retour
arrière applicatif.

Vérifier également :

- l'espace disque disponible ;
- l'état des volumes Docker ;
- la présence des deux fichiers PMTiles si le relief est activé ;
- l'existence d'une configuration Compose/Caddy de production validée ;
- l'accès au stockage de sauvegarde hors du VPS.

Ne jamais afficher le contenu de `.env` dans les logs ou le compte rendu.

## 6. Sauvegarder PostgreSQL

Le dépôt ne fournit actuellement pas de script de sauvegarde versionné. Créer une
sauvegarde au format personnalisé PostgreSQL avant le pull ou le redémarrage.
Exemple à adapter sur le serveur :

```bash
umask 077
mkdir -p /opt/opendataval/backups
docker compose exec -T db pg_dump -U opendata -d opendata_vda -Fc > /opt/opendataval/backups/opendataval-AAAA-MM-JJ-HHMM.dump
```

Le nom d'utilisateur et la base doivent correspondre à l'environnement réel. Ne
pas recopier un mot de passe dans la ligne de commande.

Vérifier immédiatement :

```bash
ls -lh /opt/opendataval/backups/opendataval-AAAA-MM-JJ-HHMM.dump
docker compose exec -T db pg_restore --list < /opt/opendataval/backups/opendataval-AAAA-MM-JJ-HHMM.dump
```

Une simple présence de fichier ne suffit pas : la commande `pg_restore --list`
doit réussir. La politique d'exploitation doit également copier la sauvegarde sur
un stockage chiffré hors du serveur et tester régulièrement une restauration sur
une base temporaire.

## 7. Déployer la mise à jour

Après sauvegarde vérifiée, et seulement si l'arbre Git du serveur est propre :

```bash
git fetch origin
git log --oneline HEAD..origin/master
git pull --ff-only origin master
```

Valider ensuite la configuration réellement utilisée. Si le serveur dispose de
fichiers de surcharge de production :

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml config
```

Construire puis relancer avec les mêmes fichiers Compose :

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
```

Ne pas inventer `docker-compose.production.yml` s'il n'existe pas sur le serveur.
Dans ce cas, s'arrêter et faire valider une configuration de production avant de
modifier le comportement local du dépôt.

L'API et le worker appliquent automatiquement les nouvelles migrations au
démarrage. Inspecter leurs logs pour confirmer chaque migration et l'absence
d'erreur :

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail=200 api worker caddy
```

## 8. Contrôles après déploiement

Pour la mini-app Feu actuellement déployée, vérifier depuis le serveur puis depuis
un poste externe :

```bash
curl --fail --silent --show-error https://euporie.cloud/feu/api/health
curl --fail --silent --show-error https://euporie.cloud/feu/api/incendies/situation
curl --fail --silent --show-error -I https://euporie.cloud/feu/
curl --fail --silent --show-error -I https://euporie.cloud/feu/temps-reel/
```

Ne tester `/eau/` sur le domaine public que lorsqu'un déploiement Eau a été
explicitement réalisé et documenté.

Puis contrôler :

- les quatre services `db`, `api`, `worker` et `caddy` ;
- l'absence de boucle de redémarrage ;
- `/api/health` avec une réponse contenant `{"status":"ok"}` ;
- les migrations dans les logs API/worker ;
- la carte, les données météo, Eau et Incendies dans un navigateur ;
- la fraîcheur des collectes dans `meta.fetch_log` ou les écrans d'exploitation ;
- le certificat HTTPS et les en-têtes de sécurité ;
- l'usage disque après reconstruction.

Si la landing page commune est déployée à la racine du domaine, contrôler aussi
qu'elle oriente correctement vers les trois entrées `/feu/`, `/eau/` et `/carte/`.
Le lien Eau ne doit être rendu public qu'après validation de son déploiement.

Une page statique accessible ne prouve pas que l'API et le worker fonctionnent.
Une réponse API correcte ne prouve pas que les pages clientes se chargent : les
deux niveaux doivent être vérifiés.

## 9. Retour arrière

En cas de régression applicative sans migration destructive :

1. conserver les logs et noter les commits avant/après ;
2. créer ou utiliser une branche de retour pointant vers le dernier commit connu
   comme fonctionnel ;
3. reconstruire les images avec la même configuration Compose ;
4. relancer sans supprimer les volumes ;
5. revérifier `/api/health`, les pages et les logs.

Ne pas utiliser `git reset --hard` sur une copie contenant des changements locaux.
Ne pas tenter de rétrograder le schéma ou de restaurer PostgreSQL automatiquement.
Si une migration est impliquée, arrêter le déploiement et préparer une procédure de
restauration validée à partir de la sauvegarde.

## 10. Mettre à jour une seule collecte

Une panne de données ne nécessite pas forcément un déploiement complet. Diagnostiquer
d'abord les logs et `meta.fetch_log`, puis relancer uniquement le job concerné :

```bash
docker compose run --rm -e RUN_ONCE=true -e RUN_ONLY=fire_risk_gard worker
docker compose run --rm -e RUN_ONCE=true -e RUN_ONLY=firms worker
```

Pour le risque Gard, un fichier de secours validé peut être placé temporairement
dans `data/incendies/YYYYMMDD.json`, conformément à
`doc/EXPLOITATION-INCENDIES.md`. Le retirer après le retour du flux automatique et
ne pas le committer.

## 11. Compte rendu de mise à jour

Consigner sans secrets :

- environnement et domaine concernés ;
- ancien et nouveau commit ;
- sauvegarde réalisée, taille, validation et copie hors site ;
- versions ou dépendances modifiées ;
- résultat des tests et du build ;
- état de `db`, `api`, `worker` et `caddy` ;
- résultat de `/api/health` et des pages contrôlées ;
- migrations appliquées ;
- avertissements et actions restantes ;
- méthode de retour arrière préparée.
