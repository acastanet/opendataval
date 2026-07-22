# Application météo — plan de conception et de réalisation V2

Dernière mise à jour : 22 juillet 2026.

## 1. Objectif du plan

Ce plan organise la construction d’une nouvelle version de l’application météo à partir de la documentation de référence.

La V2 doit être traitée comme une évolution produit complète : cadrage, architecture de l’information, prototypes, composants, intégration, tests et mise en production.

Les cases de ce document représentent des livrables vérifiables. Elles ne doivent pas être cochées sur la seule base d’une intention ou d’un prototype non intégré.

## 2. Principes de conduite

- ne pas modifier directement `master` ;
- conserver une branche dédiée à la documentation puis une branche dédiée à l’implémentation ;
- séparer les décisions produit des décisions graphiques ;
- valider le mobile avant d’élargir le bureau ;
- tester les états dégradés aussi soigneusement que l’état nominal ;
- conserver les routes publiques en production ;
- ne pas coupler la refonte visuelle aux collectes Copernicus ;
- documenter toute évolution de contrat API.

## 3. Phase 0 — référentiel

### Livrables

- [x] page d’entrée `README_meteo.md` réécrite ;
- [x] état actuel du produit documenté ;
- [x] sources, méthodes et limites documentées ;
- [x] architecture technique documentée ;
- [x] spécification fonctionnelle V2 créée ;
- [x] plan V2 créé ;
- [ ] ancien brief marqué comme historique ;
- [ ] préfixe public `/val-daigoual/` ajouté à tous les documents concernés ;
- [ ] liens internes de la documentation vérifiés.

### Critère de sortie

Une personne ne connaissant pas le projet peut distinguer :

- ce qui existe en production ;
- ce qui relève des routes internes ;
- ce qui est une contrainte de données ;
- ce qui reste à concevoir pour la V2.

## 4. Phase 1 — audit de la production

### Parcours à vérifier

- [ ] chargement direct de la vue essentielle en production ;
- [ ] navigation vers comparaison, bilan et informations ;
- [ ] changement entre les trois lieux rapides ;
- [ ] géolocalisation sur Android et iOS ;
- [ ] refus de la permission GPS ;
- [ ] vigilance disponible ;
- [ ] vigilance indisponible ;
- [ ] climatologie disponible et absente ;
- [ ] bilan disponible et absent ;
- [ ] comportement avec réseau lent ;
- [ ] liens après rechargement d’une URL profonde sous `/val-daigoual/`.

### Mesures à relever

- [ ] temps d’affichage du premier contenu ;
- [ ] changements de mise en page au chargement ;
- [ ] taille des ressources principales ;
- [ ] erreurs console ;
- [ ] erreurs réseau ;
- [ ] défauts d’accessibilité automatisés ;
- [ ] défauts observés à 200 % de zoom.

### Livrable

Créer `doc/meteo/AUDIT-PRODUCTION-V1.md` avec constats, captures, sévérité et recommandation.

## 5. Phase 2 — cadrage de l’expérience

### Questions produit

- [ ] confirmer les publics prioritaires ;
- [ ] confirmer la place de l’application détaillée `/meteo/` ;
- [ ] décider si la V2 reste multipage ;
- [ ] décider si la recherche d’adresse rejoint la vue essentielle ;
- [ ] décider si les favoris font partie du périmètre ;
- [ ] choisir les variables réellement nécessaires dans les prochains jours ;
- [ ] définir le niveau de visibilité de l’altitude du modèle ;
- [ ] définir le rôle du contexte climatique sur le premier parcours ;
- [ ] définir les informations affichées lorsque la vigilance est verte.

### Livrables

- [ ] parcours principal mobile ;
- [ ] parcours d’exploration climatique ;
- [ ] parcours de comparaison des révisions ;
- [ ] matrice contenu × priorité × source ;
- [ ] liste des décisions produit validées.

## 6. Phase 3 — architecture de l’information

### Travail attendu

- [ ] définir l’ordre des blocs sur mobile ;
- [ ] définir la navigation entre les quatre fonctions ;
- [ ] définir la profondeur des informations secondaires ;
- [ ] définir le comportement des URL et paramètres ;
- [ ] définir la présentation des sources et de la fraîcheur ;
- [ ] définir les états vides, partiels, périmés et indisponibles ;
- [ ] définir la place des graphiques et des synthèses textuelles.

### Livrables

- [ ] schéma de navigation ;
- [ ] wireframes basse fidélité mobile ;
- [ ] wireframes bureau ;
- [ ] inventaire des composants ;
- [ ] matrice des états par composant.

## 7. Phase 4 — design visuel

Le design visuel est défini après validation des wireframes.

### Décisions à prendre

- [ ] palette ;
- [ ] typographie ;
- [ ] échelle d’espacement ;
- [ ] largeur et grille ;
- [ ] style des cartes ou sections ;
- [ ] style des niveaux de vigilance ;
- [ ] style des graphiques ;
- [ ] style des états de chargement ;
- [ ] états focus, hover, actif et désactivé ;
- [ ] règles de mouvement.

### Contraintes

- contraste AA ;
- information critique non dépendante de la couleur ;
- cohérence mobile et bureau ;
- densité compatible avec de petits écrans ;
- absence de décor qui masque les données ;
- compatibilité avec `prefers-reduced-motion`.

### Livrable

Créer `doc/meteo/DESIGN-SYSTEM-V2.md` après validation, avec tokens, composants et exemples d’usage.

## 8. Phase 5 — prototype fonctionnel

### Prototype à construire

- [ ] en-tête et navigation ;
- [ ] sélecteur de lieu ;
- [ ] bloc vigilance ;
- [ ] situation actuelle ;
- [ ] tendance courte ;
- [ ] jours suivants ;
- [ ] contexte climatique ;
- [ ] résumé thermique ;
- [ ] comparaison J−1 / J ;
- [ ] bilan UTCI ;
- [ ] page d’informations.

### Données du prototype

Le prototype doit utiliser des jeux de données statiques représentant :

- état nominal ;
- vigilance orange ;
- vigilance indisponible ;
- météo partiellement indisponible ;
- données périmées ;
- absence de climatologie ;
- bilan thermique complet ;
- bilan absent ;
- températures négatives et très élevées ;
- libellé de lieu très long.

### Validation

- [ ] revue produit ;
- [ ] revue accessibilité ;
- [ ] test sur téléphone réel ;
- [ ] test clavier ;
- [ ] validation de la hiérarchie avant intégration.

## 9. Phase 6 — préparation technique

### Architecture frontend

- [ ] découper `MeteoEssentiel.svelte` en composants spécialisés ;
- [ ] isoler la gestion du lieu ;
- [ ] isoler le chargement et les états de données ;
- [ ] isoler le composant de vigilance ;
- [ ] créer des composants graphiques testables ;
- [ ] centraliser les formats de date et de nombre ;
- [ ] définir les tokens CSS ;
- [ ] vérifier le comportement sous chemin de base.

### Contrats API

- [ ] inventorier les réponses réellement utilisées ;
- [ ] ajouter des types partagés lorsque pertinent ;
- [ ] documenter les valeurs nulles ;
- [ ] documenter fraîcheur, indisponibilité et repli ;
- [ ] vérifier les paramètres de comparaison ;
- [ ] conserver la compatibilité de la production pendant la migration.

## 10. Phase 7 — implémentation incrémentale

Ordre recommandé :

1. [ ] shell, navigation et gestion du préfixe ;
2. [ ] localisation et lieux rapides ;
3. [ ] vigilance ;
4. [ ] situation actuelle ;
5. [ ] tendance sur trois heures ;
6. [ ] jours suivants ;
7. [ ] contexte climatique ;
8. [ ] résumé et page de bilan thermique ;
9. [ ] comparaison des révisions ;
10. [ ] page d’informations ;
11. [ ] états dégradés ;
12. [ ] optimisation et nettoyage.

Chaque étape doit inclure :

- composant ;
- test fonctionnel ;
- test d’accessibilité pertinent ;
- état mobile et bureau ;
- mise à jour documentaire.

## 11. Phase 8 — tests

### Tests unitaires

- [ ] calcul de tendance ;
- [ ] formatage des dates et températures ;
- [ ] choix du jour courant ;
- [ ] construction des liens ;
- [ ] gestion des valeurs absentes ;
- [ ] libellés de vigilance ;
- [ ] adaptation des réponses API.

### Tests API

- [ ] point préconfiguré ;
- [ ] point GPS précis ;
- [ ] département de vigilance ;
- [ ] vigilance indisponible ;
- [ ] contexte climatique disponible et absent ;
- [ ] bilan complet et incomplet ;
- [ ] comparaison des anciens runs.

### Tests Playwright

- [ ] bureau ;
- [ ] mobile ;
- [ ] navigation clavier ;
- [ ] géolocalisation simulée ;
- [ ] refus GPS ;
- [ ] vigilance indisponible ;
- [ ] données périmées ;
- [ ] navigation entre les quatre pages ;
- [ ] chargement direct sous préfixe ;
- [ ] absence de défilement horizontal.

### Tests manuels

- [ ] Android Chrome ;
- [ ] iOS Safari ;
- [ ] Firefox bureau ;
- [ ] Chromium bureau ;
- [ ] zoom 200 % ;
- [ ] mode contraste élevé si disponible ;
- [ ] connexion lente ;
- [ ] écran étroit.

## 12. Phase 9 — préproduction

- [ ] déployer sous un préfixe identique à `/val-daigoual/` ;
- [ ] vérifier les assets Astro ;
- [ ] vérifier les appels API relatifs ;
- [ ] vérifier les liens profonds ;
- [ ] vérifier la CSP et la géolocalisation ;
- [ ] vérifier les caches ;
- [ ] vérifier les journaux sans secret ;
- [ ] comparer les données V1 et V2 sur les trois lieux ;
- [ ] faire une revue visuelle mobile et bureau ;
- [ ] valider un plan de retour arrière.

## 13. Phase 10 — mise en production

- [ ] sauvegarder la configuration actuelle ;
- [ ] publier la V2 ;
- [ ] contrôler les quatre URL publiques ;
- [ ] contrôler les appels API ;
- [ ] contrôler les erreurs navigateur ;
- [ ] contrôler la géolocalisation HTTPS ;
- [ ] contrôler la vigilance ;
- [ ] contrôler le dernier bilan Copernicus ;
- [ ] surveiller les erreurs pendant la période de stabilisation ;
- [ ] conserver la V1 accessible temporairement si la stratégie de migration le prévoit.

## 14. Phase 11 — suivi

- [ ] recueillir les retours utilisateurs ;
- [ ] mesurer les abandons et erreurs de localisation ;
- [ ] relever les sources les plus souvent indisponibles ;
- [ ] vérifier mensuellement le bilan Copernicus ;
- [ ] vérifier annuellement la climatologie ;
- [ ] mettre à jour la documentation à chaque évolution ;
- [ ] créer des issues séparées pour les améliorations hors périmètre.

## 15. Définition de terminé

Une tâche V2 est terminée uniquement si :

- le comportement est implémenté ;
- les cas dégradés sont traités ;
- les tests pertinents passent ;
- le rendu mobile et bureau est vérifié ;
- le fonctionnement sous `/val-daigoual/` est contrôlé ;
- l’accessibilité est revue ;
- la documentation est mise à jour ;
- aucun secret ni fichier brut n’est ajouté au dépôt.