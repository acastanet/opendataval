# Déploiement VPS — guide d'exécution pour l'agent

Ce document est le guide opérationnel pour déployer **OpenData Val-d'Aigoual** sur un VPS public. L'architecture retenue est Docker Compose : PostgreSQL/PostGIS, API Fastify, worker de collecte et Caddy pour le site statique et le proxy `/api`.

## Règles impératives

- Ne déploie que sur instruction explicite du propriétaire du projet et après avoir obtenu le nom de domaine et l'accès SSH au VPS.
- Ne jamais afficher, commiter, copier dans les logs ou transmettre les valeurs de `.env` : mot de passe PostgreSQL, jetons météo, clé NASA FIRMS ou clés SSH.
- Ne jamais publier les ports PostgreSQL (`5432`), API (`3000`) ou worker. Seuls `80/tcp` et `443/tcp` doivent être accessibles publiquement.
- Ne pas exécuter `docker compose down -v`, `docker volume rm`, `docker system prune --volumes` ni toute commande susceptible de supprimer la base sans accord explicite et sauvegarde vérifiée.
- Avant toute mise à jour, exécuter une sauvegarde PostgreSQL et vérifier son existence. Prévoir un retour au commit Git précédent.
- Le fichier `Caddyfile` et le port `8080:80` présents dans le dépôt sont adaptés au développement local. Ils ne constituent pas une configuration de production HTTPS.

## Informations à obtenir avant le déploiement

Demander et consigner hors du dépôt :

1. L'adresse IP publique du VPS et un accès SSH par clé, avec un compte disposant de `sudo`.
2. Le domaine de production, par exemple `opendata.exemple.fr`.
3. L'accès à la zone DNS afin de créer l'enregistrement `A` (et `AAAA` si IPv6 est utilisé) vers le VPS.
4. Les secrets : mot de passe PostgreSQL fort, `METEOFRANCE_API_TOKEN`, `INFOCLIMAT_API_TOKEN` et, si la mini-app incendies est activée, `NASA_FIRMS_MAP_KEY`.
5. La confirmation que les ports 80 et 443 ne sont pas déjà occupés par un autre serveur web sur le VPS.
6. La décision de stockage des sauvegardes : au minimum un stockage hors VPS chiffré.

Ne pas poursuivre tant que le DNS public ne pointe pas vers le VPS et que les ports 80/443 ne sont pas ouverts dans le pare-feu du fournisseur et du serveur : Caddy ne pourra pas obtenir le certificat HTTPS.

## Pré-requis du serveur

Configuration minimale recommandée : Debian 12 ou Ubuntu LTS, 2 vCPU, 4 Go de RAM et 40 Go de disque SSD. Prévoir davantage d'espace si les fichiers de relief PMTiles sont utilisés : ils occupent environ 2 Go.

Installer Docker Engine et le plugin Docker Compose depuis le dépôt officiel Docker, en suivant la procédure correspondant au système du VPS :

- [installation Docker Engine pour Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [installation Docker Engine pour Debian](https://docs.docker.com/engine/install/debian/)

Vérifier l'installation :

```bash
docker --version
docker compose version
sudo systemctl is-active docker
```

Configurer un pare-feu minimal. Avec UFW :

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Ne pas ouvrir 5432, 3000 ni 8080 publiquement. Vérifier également les règles réseau du fournisseur cloud.

## Installation initiale

Sur le VPS, utiliser un répertoire dédié, détenu par le compte de déploiement :

```bash
sudo install -d -m 0750 -o "$USER" -g "$USER" /opt/opendataval
git clone https://github.com/acastanet/opendataval.git /opt/opendataval
cd /opt/opendataval
git status
```

Créer le fichier de secrets local sans le commiter :

```bash
cp .env.example .env
chmod 600 .env
```

Renseigner ensuite `.env` avec des valeurs réelles. Exemple de structure, sans recopier d'exemple de mot de passe en production :

```dotenv
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER=opendata
POSTGRES_PASSWORD=<mot-de-passe-long-et-aleatoire>
POSTGRES_DB=opendata_vda

SITE_DOMAIN=opendata.exemple.fr
METEOFRANCE_API_TOKEN=<optionnel>
INFOCLIMAT_API_TOKEN=<optionnel>
NASA_FIRMS_MAP_KEY=<optionnel-mais-requis-pour-FIRMS>
```

Générer le mot de passe hors des journaux partagés, par exemple :

```bash
openssl rand -base64 32
```

`POSTGRES_HOST=db` est nécessaire à la communication interne Docker. Les variables `METEOFRANCE_API_TOKEN`, `INFOCLIMAT_API_TOKEN` et `NASA_FIRMS_MAP_KEY` peuvent rester vides si les collectes correspondantes ne sont pas activées ; le worker désactive alors les jobs concernés.

## Configuration HTTPS de production

Avant le premier démarrage, préparer une configuration de production validée par le propriétaire. Elle doit remplacer les deux particularités locales actuelles :

- le bloc global Caddy `auto_https off` ;
- le mappage de port `8080:80` dans `docker-compose.yml`.

La configuration de production Caddy doit écouter le domaine sans préfixe `http://`, afin que Caddy demande et renouvelle automatiquement un certificat HTTPS. Exemple minimal à adapter dans un fichier de production versionné, tel que `Caddyfile.production` :

```caddyfile
{
    email {$CADDY_EMAIL}
}

{$SITE_DOMAIN} {
    encode zstd gzip

    handle /api/* {
        reverse_proxy api:3000
    }

    handle {
        root * /srv
        file_server
    }
}
```

La configuration Compose de production doit publier exclusivement :

```yaml
ports:
  - "80:80"
  - "443:443"
```

et monter le `Caddyfile.production` à la place du `Caddyfile` local. Elle doit conserver les volumes `caddy_data` et `caddy_config`, indispensables à la persistance des certificats. Avant de changer les fichiers, exécuter :

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml config
```

Si le dépôt ne contient pas encore de fichiers de production dédiés, proposer leur ajout dans un commit séparé et demander validation. Ne pas modifier silencieusement le comportement local du projet.

Le courriel Caddy est une donnée de configuration non secrète mais doit être ajouté à `.env` sur le VPS :

```dotenv
CADDY_EMAIL=admin@exemple.fr
```

La délivrance automatique des certificats nécessite un DNS correct et les ports 80/443 atteignables. Voir la [documentation Caddy sur HTTPS automatique](https://caddyserver.com/docs/automatic-https).

## Fichiers de relief optionnels

Le service Caddy monte ces fichiers depuis l'hôte :

```text
apps/web/public/relief/aigoual.pmtiles
apps/web/public/relief/aigoual-hd.pmtiles
```

Avant `docker compose up`, vérifier qu'ils existent sur le VPS si la carte relief 3D est activée :

```bash
ls -lh apps/web/public/relief/aigoual*.pmtiles
```

S'ils ne sont pas disponibles, ne pas créer de fichiers vides. Demander au propriétaire s'il faut désactiver provisoirement les montages ou transférer les données. Les autres fonctions de l'application ne doivent pas être bloquées sans décision explicite.

## Premier démarrage

Après validation de la configuration de production :

```bash
cd /opt/opendataval
docker compose -f docker-compose.yml -f docker-compose.production.yml pull
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --tail=100 api worker caddy
```

L'API applique les migrations de `db/migrations/` à son démarrage. Confirmer dans les logs qu'aucune migration n'a échoué. Ne jamais lancer manuellement une migration destructrice sans sauvegarde et accord.

Vérifications à effectuer depuis le VPS puis depuis un poste externe :

```bash
curl --fail --silent --show-error http://127.0.0.1/api/health
curl --fail --silent --show-error https://opendata.exemple.fr/api/health
curl --fail --silent --show-error -I https://opendata.exemple.fr/
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
```

Le premier appel doit renvoyer un JSON contenant `{"status":"ok"}`. Vérifier aussi dans un navigateur que les pages `/`, `/carte/`, `/eau/` et `/incendies/` sont accessibles, ainsi que l'absence d'erreur critique dans les journaux.

## Mise à jour applicative

Exécuter les mises à jour dans cet ordre :

```bash
cd /opt/opendataval
git fetch origin
git status --short
git log --oneline HEAD..origin/master
```

S'il existe des modifications locales inattendues, s'arrêter et demander une décision. Sinon :

```bash
./scripts/backup-postgres.sh
git pull --ff-only origin master
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
curl --fail --silent --show-error https://opendata.exemple.fr/api/health
```

Le script de sauvegarde ci-dessus est à créer et à tester avant la première mise à jour si le dépôt ne le fournit pas encore. À défaut, produire manuellement une sauvegarde :

```bash
umask 077
mkdir -p /opt/opendataval/backups
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "/opt/opendataval/backups/opendataval-$(date +%F-%H%M%S).dump"
find /opt/opendataval/backups -type f -name '*.dump' -mtime +14 -delete
```

Avant d'utiliser cette commande, charger `.env` dans un shell sûr ou fournir les variables à Docker Compose ; ne pas imprimer leur valeur. Tester régulièrement une restauration sur une base temporaire, car une sauvegarde non restaurable n'est pas une sauvegarde.

## Supervision et maintenance

Commandes de diagnostic non destructives :

```bash
cd /opt/opendataval
docker compose -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -f docker-compose.yml -f docker-compose.production.yml logs --since=1h --tail=200 api worker caddy
docker stats --no-stream
df -h
docker volume ls
```

Mettre en place :

- une sauvegarde PostgreSQL quotidienne, chiffrée et copiée hors du VPS ;
- une rétention documentée (par exemple 14 jours locaux et 30 jours hors site) ;
- la rotation des logs Docker ;
- une alerte en cas d'échec du `curl https://<domaine>/api/health`, d'espace disque insuffisant ou d'échec de sauvegarde ;
- une mise à jour régulière mais planifiée de l'OS et de Docker.

Pour redémarrer un seul service après diagnostic :

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml restart worker
```

Ne redémarrer la base de données ou l'ensemble de la pile qu'après avoir évalué l'impact sur le service.

## Retour arrière

En cas d'échec après une mise à jour :

1. Conserver les logs et noter le commit déployé.
2. Revenir au dernier commit connu comme fonctionnel avec `git checkout <commit>` ou une branche de release, sans toucher aux volumes Docker.
3. Reconstruire puis relancer les services avec la même commande Compose de production.
4. Vérifier `/api/health` et les journaux.
5. Si une migration de schéma est impliquée, ne pas restaurer ni rétrograder la base sans procédure de restauration validée et sauvegarde vérifiée.

## Compte-rendu obligatoire de l'agent

Après un déploiement, indiquer sans exposer les secrets :

- domaine et commit Git déployé ;
- état des quatre services (`db`, `api`, `worker`, `caddy`) ;
- résultat des contrôles HTTPS et `/api/health` ;
- résultat de la sauvegarde et son emplacement hors site ;
- éventuels avertissements, limitations ou actions à faire.
