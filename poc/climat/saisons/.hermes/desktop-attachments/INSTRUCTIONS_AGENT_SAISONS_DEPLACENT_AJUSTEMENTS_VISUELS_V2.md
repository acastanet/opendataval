# Instructions agent de codage — Ajustements visuels V2 « Les saisons se déplacent »

## 0. Objet

Ces instructions s’adressent à l’agent qui a déjà réalisé l’implémentation de l’infographie **« Les saisons se déplacent »**.

Le pipeline scientifique, les dates calculées, les médianes, les dispersions P25–P75 et les écarts entre décennies sont considérés comme **validés**.

Cette passe porte uniquement sur le **rendu visuel**.

Les trois changements demandés sont :

1. **Changer les couleurs des saisons**
   - hiver = bleu
   - été = rouge
   - printemps et automne = blanc / blanc chaud

2. **Relier visuellement les changements de saison entre les deux périodes**
   - connecter les transitions homologues entre `1996–2005` et `2016–2025`
   - rendre immédiatement visible le décalage des frontières saisonnières

3. **Passer sur un fond gris neutre avec des ombres**
   - utiliser le thème neutre déjà employé dans l’empreinte climatique
   - donner du relief aux bandes sans transformer le rendu en dashboard

---

# 1. Contraintes impératives

Ne pas modifier :

- la méthode scientifique T25/T75 ;
- les données ERA5-Land ;
- les dates annuelles calculées ;
- les médianes décennales ;
- les P25/P75 ;
- les écarts en jours ;
- la durée de l’été thermique ;
- le JSON scientifique ;
- les règles de validation ;
- la logique de calcul.

Cette intervention doit rester strictement séparée de la couche scientifique.

Le diff attendu doit concerner principalement :

- le renderer SVG ;
- les constantes de thème ;
- les styles ;
- éventuellement le HTML de prévisualisation.

---

# 2. Palette générale à utiliser

Le projet dispose déjà dans `fingerprint.py` d’une palette cohérente :

```text
COMMON_PALETTE

0.00  #2166AC
0.25  #92C5DE
0.38  #D1E5F0
0.44  #F3F5F4
0.50  #FBFAF7
0.56  #F7F3EF
0.62  #FDDBC7
0.75  #F4A582
1.00  #B2182B
```

Pour « Les saisons se déplacent », ne pas utiliser le gradient complet.

Réutiliser uniquement ses trois pôles :

```text
HIVER        #2166AC
INTERSAISON  #FBFAF7
ÉTÉ          #B2182B
```

Les couleurs doivent donc exprimer :

```text
froid  →  transition  →  chaud
bleu      blanc chaud     rouge
```

---

# 3. Couleurs saisonnières

## 3.1 Hiver

Couleur principale :

```text
#2166AC
```

Le bleu doit être franc et suffisamment sombre pour identifier immédiatement le pôle froid.

## 3.2 Été

Couleur principale :

```text
#B2182B
```

Le rouge doit représenter clairement le pôle chaud.

## 3.3 Printemps

Couleur :

```text
#FBFAF7
```

## 3.4 Automne

Même couleur :

```text
#FBFAF7
```

Le printemps et l’automne sont volontairement regroupés graphiquement comme **intersaisons**.

Ne pas chercher à les distinguer par deux couleurs différentes.

La distinction printemps / automne est donnée par :

- leur position dans l’année ;
- leurs libellés ;
- les frontières thermiques.

---

# 4. Intention graphique

Le lecteur doit percevoir une structure continue :

```text
HIVER → INTERSAISON → ÉTÉ → INTERSAISON → HIVER
```

Le visuel ne doit plus donner l’impression de quatre catégories indépendantes.

L’objectif est de faire apparaître :

- deux pôles thermiques forts :
  - hiver
  - été
- deux zones de transition claires :
  - printemps
  - automne

Cette simplification doit renforcer la lecture du déplacement des saisons.

---

# 5. Fond général

Utiliser le thème neutre déjà présent dans `fingerprint.py`.

Valeurs de référence :

```text
background = #C5C4C1
band_plate = #FBFAF7
shadow     = #1C2529
```

Le fond général doit donc devenir :

```text
#C5C4C1
```

Le blanc chaud des intersaisons doit ressortir naturellement sur ce fond gris.

---

# 6. Plaque de support

Si les bandes reposent actuellement directement sur le fond, ajouter une plaque claire de support derrière l’ensemble du graphique principal.

Couleur :

```text
#FBFAF7
```

Cette plaque doit être :

- rectangulaire ;
- sans effet décoratif excessif ;
- sans gros bord ;
- sans coins fortement arrondis.

Préférence :

```text
rx = 0
ry = 0
```

ou un rayon quasi nul si une contrainte technique l’impose.

---

# 7. Ombres

Ajouter une ombre discrète sous la plaque ou sous le groupe des bandes.

Réutiliser :

```text
shadow color = #1C2529
```

Opacité recommandée :

```text
0.18 à 0.22
```

Décalage vertical :

```text
4 à 8 px
```

Flou :

```text
faible à modéré
```

L’ombre doit :

- détacher le graphique du fond gris ;
- donner une présence physique à l’objet ;
- rester subtile.

À éviter :

- ombre noire très forte ;
- gros halo ;
- plusieurs couches d’ombres ;
- esthétique de carte SaaS flottante.

---

# 8. Relier les changements de saison entre les deux décennies

## 8.1 Objectif

Les deux bandes :

```text
1996–2005
2016–2025
```

ne doivent plus être lues comme deux objets indépendants.

Chaque frontière saisonnière de la première période doit être visuellement reliée à la frontière homologuée de la seconde période.

Transitions à connecter :

```text
début printemps
début été
début automne
début hiver
```

---

# 9. Principe des connecteurs

Pour chaque frontière :

```text
x_top    = position médiane 1996–2005
x_bottom = position médiane 2016–2025
```

Tracer une liaison entre :

```text
(x_top, bas de la bande supérieure)
```

et :

```text
(x_bottom, haut de la bande inférieure)
```

Le déplacement horizontal de la liaison montre directement :

- plus tôt ;
- plus tard.

Exemple :

```text
1996–2005        │
                  ╲
                   ╲
2016–2025          │
```

ou dans l’autre sens :

```text
1996–2005          │
                  ╱
                 ╱
2016–2025        │
```

---

# 10. Forme des liaisons

Première implémentation recommandée :

- segments droits légèrement obliques ;
- pas de flèches ;
- pas de gros marqueurs ;
- pas de courbes décoratives.

Style :

```text
stroke = #52616A
stroke-width = 1.5
opacity = 0.50
fill = none
```

Si le rendu paraît trop rigide, tester ensuite une courbe très légère.

Mais la V2 doit d’abord privilégier la lisibilité.

---

# 11. Les connecteurs doivent passer entre les bandes

Le connecteur doit être visible essentiellement dans l’espace séparant :

```text
bande 1996–2005
```

et :

```text
bande 2016–2025
```

Il ne doit pas traverser inutilement toute la hauteur des rectangles colorés.

Ancrer précisément chaque connecteur sur la médiane correspondante.

---

# 12. Traitement particulier des intersaisons

Comme printemps et automne deviennent blancs, les frontières prennent plus d’importance.

Les connecteurs doivent permettre de lire immédiatement :

```text
hiver → printemps
printemps → été
été → automne
automne → hiver
```

La transition doit donc être matérialisée par :

1. la rupture de couleur ;
2. la ligne médiane ;
3. le connecteur entre les deux décennies.

Ne pas ajouter d’autre codage graphique.

---

# 13. P25–P75

Les zones P25–P75 doivent rester présentes.

Elles représentent la **dispersion interannuelle** des dates de transition au sein de chaque décennie.

Ne pas les supprimer au profit des connecteurs.

Style recommandé :

```text
fill = #52616A
opacity = 0.12 à 0.16
```

La ligne de médiane :

```text
stroke = #24313A
stroke-width = 1.5 à 2
```

Cette solution neutre évite de multiplier les couleurs autour du bleu, du blanc et du rouge.

---

# 14. Ordre visuel des couches SVG

Respecter l’ordre de rendu suivant :

```text
1. fond gris
2. ombre
3. plaque claire
4. connecteurs entre décennies
5. bandes saisonnières
6. zones P25–P75
7. lignes de médiane
8. labels
9. annotations de décalage
```

Le point important est que les connecteurs soient :

- derrière les textes ;
- derrière les médianes ;
- mais visibles entre les deux bandes.

---

# 15. Bandes saisonnières

Conserver deux bandes horizontales :

```text
1996–2005
2016–2025
```

Elles doivent rester :

- continues ;
- jointives ;
- sans blanc entre saisons ;
- sans coins arrondis.

Utiliser :

```text
rx = 0
ry = 0
```

Les changements de saison sont représentés exactement par la frontière entre deux rectangles adjacents.

---

# 16. Pas de vide entre les segments

À l’intérieur d’une bande :

```text
gap = 0
```

Entre :

```text
hiver / printemps
printemps / été
été / automne
automne / hiver
```

les rectangles doivent se toucher exactement.

Éviter :

```text
stroke: white
```

sur les segments.

Si un contour technique est nécessaire, utiliser la couleur du segment ou aucun contour.

---

# 17. Labels des saisons

Conserver :

```text
HIVER
PRINTEMPS
ÉTÉ
AUTOMNE
HIVER
```

Les labels doivent rester lisibles sur les nouvelles couleurs.

## Sur hiver bleu

Texte recommandé :

```text
#FBFAF7
```

## Sur été rouge

Texte recommandé :

```text
#FBFAF7
```

## Sur printemps / automne blancs

Texte :

```text
#24313A
```

Ne pas créer de contour autour du texte.

---

# 18. Couleurs du texte général

Réutiliser :

```text
texte principal   #24313A
texte secondaire  #52616A
```

Conserver la pile de police déjà utilisée :

```text
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

---

# 19. Hiérarchie typographique

Conserver approximativement les dimensions déjà cohérentes avec `fingerprint.py`.

Référence :

```text
titre principal       20–23 px
sous-titre            14 px
labels de période     13–14 px
labels de saison      11–13 px
annotations           10–12 px
texte secondaire      10 px
```

Ne pas augmenter la quantité de texte dans le SVG.

---

# 20. Annotations de déplacement

Conserver les valeurs actuelles calculées :

```text
XX j plus tôt
XX j plus tard
```

ou leur forme compacte :

```text
−XX j
+XX j
```

Le connecteur devient la représentation graphique principale du déplacement.

Les chiffres servent de confirmation.

Ne pas faire :

- grosse flèche ;
- grand cartouche ;
- couleur supplémentaire.

---

# 21. Indicateur « Été thermique »

Conserver le bloc :

```text
Été thermique
+XX jours
```

Il peut reprendre le rouge de l’été pour sa valeur principale :

```text
#B2182B
```

Le label reste :

```text
#24313A
```

Ne pas ajouter un bloc équivalent pour toutes les saisons dans cette passe.

---

# 22. Exemple de composition cible

```text
fond gris neutre

        JAN  FÉV  MAR  AVR  MAI  JUN  JUL  AOÛ  SEP  OCT  NOV  DÉC

1996–2005
██████████│░░░░░░░░│████████████████│░░░░░░░│██████████
  bleu       blanc        rouge          blanc       bleu
            ╲          ╲              ╱          ╱
             ╲          ╲            ╱          ╱
2016–2025
████████│░░░░░░░│████████████████████│░░░░░░░░│████████
 bleu      blanc          rouge           blanc      bleu
```

Le schéma ci-dessus est conceptuel.

Les longueurs doivent toujours provenir des vraies médianes calculées.

---

# 23. Tests visuels demandés

Produire au minimum :

```text
1920 px
1440 px
1280 px
768 px
390 px
```

Vérifier sur chaque capture :

- hiver bleu ;
- été rouge ;
- intersaisons blanches ;
- fond gris neutre ;
- ombre discrète ;
- connecteurs visibles ;
- connecteurs correctement attachés aux médianes ;
- P25–P75 encore lisibles ;
- aucun chevauchement de texte ;
- aucun arrondi indésirable ;
- aucune coupure entre saisons.

---

# 24. Test de non-régression scientifique

Avant et après modification, comparer le JSON ou les objets de calcul.

Doivent être strictement identiques :

```text
T25
T75
spring_start
summer_start
autumn_start
winter_start
P25
median
P75
shifts
summer_length_change
```

Le changement de renderer ne doit avoir aucun effet sur ces valeurs.

---

# 25. Test des connecteurs

Ajouter un test ciblé.

Pour chaque frontière :

```text
connector.x1 == median_top_x
connector.x2 == median_bottom_x
```

avec tolérance uniquement liée au calcul de position SVG.

Vérifier les quatre transitions :

```text
spring
summer
autumn
winter
```

---

# 26. Réutilisation du thème existant

Le code fourni indique que `fingerprint.py` dispose déjà de :

```text
THEMES["neutral"]
COMMON_PALETTE
BAND_PLATE
```

Avant de dupliquer ces valeurs :

1. vérifier si elles peuvent être importées depuis un module commun ;
2. si elles sont aujourd’hui privées à `fingerprint.py`, envisager de déplacer uniquement les constantes réellement partagées vers un module de thème commun ;
3. ne pas créer une refactorisation importante pour cette tâche.

Priorité :

> produire le rendu demandé avec un diff minimal et propre.

---

# 27. Fichiers attendus

L’agent doit produire ou mettre à jour :

```text
thermal-seasons.svg
thermal-seasons-preview.html
```

Captures :

```text
captures/
  thermal-seasons-neutral-1920.png
  thermal-seasons-neutral-1440.png
  thermal-seasons-neutral-1280.png
  thermal-seasons-neutral-768.png
  thermal-seasons-neutral-390.png
```

Et une courte note :

```text
THERMAL_SEASONS_VISUAL_CHANGELOG.md
```

---

# 28. Contenu du changelog

Indiquer uniquement :

```text
- palette saisonnière simplifiée :
  hiver bleu / intersaisons blanches / été rouge

- activation du fond neutre

- ajout d’une ombre légère

- ajout de connecteurs entre les quatre transitions médianes
  de 1996–2005 et 2016–2025

- aucune modification scientifique
```

---

# 29. Critères d’acceptation

La passe est validée si :

- [ ] hiver = `#2166AC`
- [ ] été = `#B2182B`
- [ ] printemps = `#FBFAF7`
- [ ] automne = `#FBFAF7`
- [ ] fond général = `#C5C4C1`
- [ ] une ombre discrète est visible
- [ ] les quatre frontières homologues sont reliées entre les deux bandes
- [ ] les connecteurs montrent clairement les déplacements gauche/droite
- [ ] les P25–P75 restent visibles
- [ ] les médianes restent visibles
- [ ] aucun arrondi
- [ ] aucun espace entre segments d’une même bande
- [ ] les textes restent lisibles sur bleu, blanc et rouge
- [ ] aucune valeur scientifique n’a changé
- [ ] SVG propre et autonome
- [ ] captures responsive produites

---

# 30. Non-objectifs

Ne pas travailler dans cette passe sur :

- changement de méthode T25/T75 ;
- nouveau lissage ;
- nouvelle source Copernicus ;
- UTCI ;
- précipitations ;
- événements exceptionnels ;
- phénologie ;
- projection future ;
- nouvelle mise en page globale de la page climat.

Cette passe doit uniquement améliorer **la lecture graphique du déplacement des saisons**.

---

# 31. Résumé opérationnel

À faire maintenant :

```text
1. passer le fond en gris neutre
2. mettre l’hiver en bleu
3. mettre l’été en rouge
4. mettre printemps + automne en blanc chaud
5. supprimer tout arrondi et tout vide entre saisons
6. relier les quatre transitions médianes haut/bas
7. conserver P25–P75
8. ajouter une ombre légère
9. vérifier le contraste des textes
10. produire captures + tests de non-régression
```

Le rendu final doit donner une lecture immédiate :

> **le froid se retire, le chaud s’étend, et les frontières saisonnières se déplacent.**
