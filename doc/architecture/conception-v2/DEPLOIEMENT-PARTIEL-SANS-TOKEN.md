# Déploiement partiel sans token Météo-France valide

## État autorisé

Le commit fonctionnel `46888d7b192add720c982727fa34bef21a92db0d` peut rester partiellement déployé avec :

- la nouvelle image API active ;
- l’ancienne instance permanente du worker conservée ;
- l’endpoint `/api/v1/meteo/health` en état `degraded` ;
- les modèles météo utilisés comme repli normal ;
- les images de retour arrière conservées.

## Limite

Ce déploiement partiel ne constitue pas l’activation des observations nationales.

Tant que `METEOFRANCE_API_TOKEN` n’est pas valide :

- ne pas exécuter `meteo_stations` ;
- ne pas exécuter `meteo_obs_national` ;
- ne pas recréer le worker permanent avec une valeur tronquée ;
- ne pas lancer la partie 2 de validation nationale ;
- ne pas fermer l’issue de déploiement.

## Reprise après installation du token

Après remplacement sécurisé de la variable dans `/root/opendataval/.env` :

1. tester le token sur les deux endpoints nationaux ;
2. exécuter `meteo_stations` avec la nouvelle image worker ;
3. vérifier au moins 1 000 stations ;
4. exécuter `meteo_obs_national` ;
5. vérifier des observations fraîches ;
6. recréer le worker permanent ;
7. lancer les sondes locale et publique ;
8. exécuter la partie 2 du protocole.

Aucune reconstruction d’image n’est nécessaire si l’image `opendataval-worker:latest` construite lors de la partie 1 est toujours disponible et correspond au commit attendu.
