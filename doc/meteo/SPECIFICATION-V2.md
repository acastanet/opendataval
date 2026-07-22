# Application météo — spécification de la prochaine version

Statut : document de conception.

Dernière mise à jour : 22 juillet 2026.

## 1. Finalité

La prochaine version doit proposer une application météo locale plus claire, plus cohérente et plus facile à faire évoluer, sans réduire la richesse fonctionnelle déjà acquise.

Il ne s’agit pas de redessiner à l’identique l’interface existante. La V2 doit reconstruire la hiérarchie à partir des besoins utilisateur, des contraintes de sécurité et des contrats de données.

## 2. Objectif principal

L’application doit permettre à une personne de répondre successivement à quatre questions :

1. Où porte exactement la prévision ?
2. Y a-t-il une vigilance officielle à prendre en compte ?
3. Quel temps est estimé maintenant et dans les prochaines heures ?
4. Comment situer cette situation dans le temps : prochains jours, révisions et contexte climatique ?

## 3. Publics

### Public principal

Habitants, visiteurs et acteurs locaux cherchant une information météo rapidement compréhensible sur mobile.

### Public secondaire

Utilisateurs souhaitant comprendre la stabilité des prévisions, le contexte climatique ou les indicateurs de stress thermique.

### Public technique

Équipe de développement et d’exploitation chargée de vérifier les sources, la fraîcheur et les traitements.

## 4. Périmètre fonctionnel

La V2 conserve les quatre fonctions actuelles :

- situation essentielle ;
- comparaison des révisions ;
- bilan thermique ;
- informations et limites.

La structure peut rester multipage ou évoluer vers une application à navigation interne, à condition de conserver :

- des URL stables et partageables ;
- un historique navigateur fonctionnel ;
- un chargement direct de chaque vue ;
- une navigation accessible sans JavaScript critique supplémentaire.

## 5. Architecture de l’information cible

### Niveau 1 — décision immédiate

Doivent apparaître en premier :

1. lieu sélectionné et nature de la localisation ;
2. vigilance officielle ;
3. température actuelle estimée et ressenti ;
4. tendance des prochaines heures ;
5. accès au changement de lieu.

### Niveau 2 — anticipation courte

- minimum et maximum du jour ;
- trois jours suivants ;
- pluie, vent ou phénomènes utiles si leur ajout est validé ;
- heure de mise à jour et état de fraîcheur.

### Niveau 3 — mise en perspective

- comparaison à la référence climatique ;
- résumé du bilan thermique ;
- accès aux révisions J−1 / J ;
- sources et limites.

La priorité donnée au premier niveau ne signifie pas que tout doit tenir dans un seul écran.

## 6. Localisation

La V2 doit proposer :

- Val-d’Aigoual comme point initial ;
- les trois lieux rapides actuels ;
- la géolocalisation GPS ;
- un libellé géocodé ;
- l’affichage de la précision GPS ;
- une solution de repli par coordonnées lorsque le géocodage échoue.

À étudier pour la V2 :

- recherche d’adresse unifiée avec l’application détaillée ;
- lieux favoris locaux ;
- historique récent ;
- partage d’un lieu par URL.

Ces fonctions ne doivent pas surcharger la lecture initiale.

## 7. Vigilance et sécurité

La vigilance reste placée avant les prévisions ordinaires.

Exigences obligatoires :

- département calculé à partir du point ;
- affichage d’aujourd’hui et de demain ;
- phénomènes et niveaux lisibles sans dépendre uniquement de la couleur ;
- lien vers Météo-France ;
- heure de mise à jour ;
- état « Niveau inconnu » en cas d’indisponibilité ;
- aucun repli automatique vers le vert.

La V2 doit traiter la vigilance comme un composant fonctionnel distinct, doté de ses propres états et tests.

## 8. Situation actuelle

Le bloc principal doit inclure :

- température estimée ;
- ressenti estimé ;
- maximum et minimum du jour ;
- condition météo si elle est jugée utile lors du prototypage ;
- altitude du point de modèle, soit directement, soit dans un niveau de détail accessible ;
- heure de production ou de consultation clairement qualifiée.

Le terme « estimation » doit être visible sans imposer un texte long.

## 9. Tendance à court terme

La V2 doit remplacer ou améliorer le graphique actuel selon les résultats des prototypes.

Le composant doit :

- montrer au minimum les trois prochaines heures ;
- rendre lisibles les valeurs et l’échéance ;
- formuler la hausse, la baisse ou la stabilité en texte ;
- fonctionner sans animation ;
- rester interprétable par lecteur d’écran ;
- éviter une précision graphique supérieure à celle des données.

Une courbe horaire plus longue peut être envisagée si elle ne concurrence pas la lecture immédiate.

## 10. Prévisions des prochains jours

Afficher au minimum trois jours après aujourd’hui avec :

- jour et date ;
- minimum ;
- maximum.

Les ajouts éventuels doivent être priorisés :

- condition dominante ;
- probabilité ou cumul de pluie ;
- rafale maximale.

La transition AROME vers ARPEGE doit être compréhensible si les données mélangent plusieurs modèles.

## 11. Contexte climatique

La comparaison ERA5-Land doit être présentée comme un éclairage distinct de la prévision.

Exigences :

- période 1991–2020 visible ;
- comparaison à la médiane ;
- mention du P90 lorsqu’il est dépassé ;
- formulation prudente ;
- source et limite accessibles ;
- absence totale du bloc si les données ne sont pas valides.

La V2 ne doit pas mélanger visuellement climat et météo immédiate au point de rendre leur nature ambiguë.

## 12. Bilan thermique

La vue détaillée doit conserver :

- le mois complet étudié ;
- les quatre familles d’indicateurs ;
- les écarts à la référence ;
- les dates exactes des dépassements ;
- la définition de l’UTCI ;
- la résolution de la maille ;
- la complétude et la source.

À améliorer :

- compréhension des seuils ;
- usage clavier et tactile des dates ;
- comparaison entre lieux ;
- narration mensuelle simple avant le détail chiffré.

## 13. Comparaison des révisions

La V2 doit expliquer dès l’entrée que la page mesure une révision, non une erreur.

Elle conserve :

- périodes 7, 14 et 30 jours ;
- températures minimales et maximales ;
- pluie ;
- changements de scénario ;
- sens des écarts moyens.

Améliorations attendues :

- lecture des signes plus intuitive ;
- séparation entre synthèse et détail journalier ;
- explication des valeurs nulles ou absentes ;
- possibilité d’identifier les journées les plus révisées ;
- affichage mobile sans tableau horizontal illisible.

## 14. Page d’informations

La page doit devenir le glossaire de confiance de la suite.

Elle doit couvrir :

- origine des données ;
- résolution et altitude ;
- différence entre estimation, mesure et vigilance ;
- ERA5-Land, ERA5-HEAT et UTCI ;
- révisions J−1 / J ;
- fraîcheur ;
- données manquantes ;
- rôle prioritaire des bulletins officiels.

Elle doit rester concise à l’ouverture, avec des niveaux de détail progressifs.

## 15. Design cible

Le nouveau design n’est pas figé par ce document. Il doit toutefois respecter les principes suivants :

- mobile-first ;
- hiérarchie très explicite ;
- cohérence entre les quatre vues ;
- densité maîtrisée ;
- contraste élevé ;
- typographie lisible ;
- composants reproductibles ;
- graphiques sobres ;
- états de chargement stables ;
- absence d’effets décoratifs qui concurrencent l’information.

Le style visuel actuel peut être abandonné, conservé partiellement ou transformé après prototypage. Les décisions de palette, de formes et de typographie doivent être documentées dans un document de design distinct après validation.

## 16. Accessibilité

Objectif minimal : conformité RGAA/WCAG de niveau AA sur les parcours principaux.

Exigences :

- navigation clavier complète ;
- ordre de focus logique ;
- titres structurés ;
- labels visibles ou accessibles ;
- zones tactiles suffisantes ;
- contrastes vérifiés ;
- pas d’information critique uniquement colorée ;
- messages dynamiques annoncés ;
- respect de `prefers-reduced-motion` ;
- graphiques accompagnés d’une synthèse textuelle ;
- tests à 200 % de zoom et sur largeur mobile.

## 17. Performance

La V2 doit :

- afficher rapidement le squelette de la page ;
- charger la météo immédiate avant les blocs climatiques ;
- charger en parallèle les données indépendantes ;
- éviter les sauts de mise en page ;
- ne pas charger de carte si elle n’est pas utilisée ;
- limiter les dépendances graphiques ;
- conserver le cache et le rafraîchissement différenciés par source.

## 18. Résilience

Chaque bloc doit posséder son état :

- chargement ;
- disponible ;
- indisponible ;
- périmé ;
- non applicable ;
- incomplet.

Une erreur partielle ne doit pas effacer toute la page.

Les données critiques doivent être accompagnées d’une action utile : recharger, consulter la source officielle ou comprendre la limite.

## 19. URL et déploiement

Les routes internes restent `/meteo/...`.

La production utilise le préfixe public `/val-daigoual/`, notamment :

```text
https://euporie.cloud/val-daigoual/meteo/essentiel/
```

La V2 doit fonctionner :

- à la racine en développement ;
- sous un chemin de base en production ;
- avec les paramètres `lieu`, `lat` et `lon` utiles ;
- avec des liens relatifs robustes ;
- après chargement direct d’une URL profonde.

## 20. Compatibilité technique

La V2 peut réorganiser les composants Svelte et Astro. Elle ne doit pas modifier les contrats API sans :

1. documenter le nouveau contrat ;
2. prévoir une migration ou une compatibilité ;
3. mettre à jour les tests ;
4. vérifier le déploiement sous préfixe.

Les jobs Copernicus, leurs tables et leur planification ne sont pas couplés au design et doivent rester hors des requêtes utilisateur.

## 21. Critères d’acceptation

La V2 est considérée comme prête lorsque :

- les quatre vues sont cohérentes ;
- la vigilance indisponible ne peut jamais apparaître verte ;
- le lieu et la nature de la donnée sont immédiatement compréhensibles ;
- les parcours GPS et lieux rapides fonctionnent sur mobile ;
- les données partielles sont correctement isolées ;
- les différences météo/climat/révision sont explicites ;
- les pages fonctionnent sous `/val-daigoual/` ;
- les tests Playwright mobile et bureau passent ;
- la documentation produit, technique et d’exploitation est à jour ;
- les captures ont été vérifiées humainement avant acceptation.