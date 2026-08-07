# 07 — Règles pour l’agent de codage

## 1. Réutiliser avant de créer

Avant de créer :

- un service ;
- un client API ;
- une bibliothèque ;
- une route ;
- un modèle ;

chercher si le dépôt possède déjà une brique correspondante.

## 2. Ne pas refondre les microservices existants pour les faire correspondre aux six sphères

Les sphères sont une organisation produit, pas une contrainte de découpage technique.

## 3. Ne pas ajouter de nouvelle source de données pendant M1 sauf nécessité directe

Si une donnée manque pour démontrer la chaîne, utiliser d’abord une source déjà disponible dans le dépôt.

## 4. Garder `site-service` mince

Il orchestre et normalise.

Il ne doit pas absorber :

- la génération LiDAR ;
- les calculs métier BRGM ;
- le calcul OLD ;
- la cartographie.

## 5. Un changement de contrat est une décision explicite

Ne pas modifier silencieusement :

- taille de dalle ;
- projection ;
- cycle de vie ;
- structure du manifeste ;
- valeurs des relations spatiales.

Documenter la nécessité et mettre à jour les fichiers de référence et les tests.

## 6. Une donnée externe doit être qualifiée

Conserver autant que possible :

- source ;
- dataset ;
- date ;
- distance ;
- résolution ;
- méthode de sélection ;
- disponibilité ;
- revue.

## 7. Pas de valeur inventée

Une source absente ou en erreur produit un statut explicite.

## 8. Préférer un flux exécutable à une architecture abstraite

Chaque lot doit améliorer une chaîne réellement exécutable.

## 9. Petits commits cohérents

Un commit doit correspondre à une unité vérifiable :

- contrat ;
- stockage ;
- route ;
- adaptateur ;
- test ;
- écran.

## 10. Fin de tâche

Pour chaque tâche importante, fournir :

- fichiers modifiés ;
- commande de test ;
- résultat des tests ;
- limite connue ;
- prochaine dépendance.
