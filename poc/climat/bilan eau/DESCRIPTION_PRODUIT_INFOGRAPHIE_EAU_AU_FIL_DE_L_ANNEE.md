# Description produit — Infographie « L’eau au fil de l’année »

## 1. Position dans la page climat

**« L’eau au fil de l’année »** est la troisième grande infographie d’analyse du changement climatique après :

1. **L’empreinte climatique du lieu**  
   *Qu’est-ce qui a changé en trente ans ?*

2. **Les saisons se déplacent**  
   *Le rythme thermique de l’année n’est plus le même.*

3. **L’eau au fil de l’année**  
   *Quand l’eau arrive-t-elle, combien le sol en conserve-t-il et quand le déficit s’installe-t-il ?*

Cette troisième infographie doit reprendre la même famille graphique que les deux premières :

- fond gris neutre ;
- titre et sous-titre en haut à gauche ;
- période et référence immédiatement visibles ;
- composition horizontale ;
- rectangles et bandes sans effets décoratifs inutiles ;
- ombre légère ;
- typographie système ;
- informations scientifiques concentrées dans le graphique ;
- explications méthodologiques détaillées laissées au HTML.

L’objectif n’est pas de créer un tableau de bord hydrologique, mais une **image climatique simple et lisible du cycle annuel de l’eau**.

---

# 2. Question produit

L’infographie doit répondre en un regard à :

> **La pluie tombe-t-elle encore au même moment, le sol garde-t-il l’eau aussi longtemps, et la période de déficit hydrique s’est-elle déplacée ?**

La pluie seule ne suffit pas à raconter l’eau.

Deux périodes peuvent recevoir des cumuls annuels proches tout en présentant des situations très différentes :

- pluie plus concentrée ;
- recharge du sol plus tardive ;
- dessèchement plus précoce ;
- évapotranspiration plus importante ;
- déficit climatique plus long.

L’infographie doit donc raconter une séquence :

> **arrivée de l’eau → stockage dans le sol → retour vers l’atmosphère → déficit ou excédent**

---

# 3. Ce que représente réellement le lieu

Cette précision doit faire partie du produit et être visible dans la page.

Les variables principales proviennent de **ERA5-Land**, une réanalyse climatique sur grille.

Elles décrivent donc :

> **le contexte hydroclimatique de la maille de réanalyse associée au lieu**

et non :

> « l’humidité réellement mesurée sur le terrain »  
> « la quantité d’eau disponible précisément dans la parcelle »  
> « le débit d’un cours d’eau local ».

La page doit pouvoir afficher dans son bloc de provenance :

- coordonnées demandées ;
- coordonnées du point ERA5-Land utilisé ;
- résolution du dataset ;
- altitude du lieu si disponible ;
- orographie ou altitude représentative du modèle si disponible ;
- différence d’altitude ;
- date de récupération ;
- version des données.

En terrain complexe, notamment montagneux, cette information est essentielle.

Le rendu principal doit rester simple, mais la provenance doit permettre au lecteur de comprendre la **représentativité spatiale** des données.

---

# 4. Sources et variables retenues

## Source principale

**ERA5-Land**

Variables utilisées :

- précipitations totales ;
- humidité volumique du sol, couches 1 à 3 ;
- évapotranspiration réelle ;
- éventuellement ruissellement ;
- éventuellement neige et fonte.

## Source complémentaire

**ERA5-Drought**

Variable :

- SPEI-3.

## Référence climatologique

**1991–2020**

## Période étudiée

**1996–2025**

## Comparaison principale

**1996–2005**  
vs  
**2016–2025**

La décennie intermédiaire **2006–2015** peut rester calculée dans les données sans être nécessairement affichée.

---

# 5. Les quatre signaux à représenter

L’infographie V1 doit se limiter à quatre signaux principaux.

## 5.1 Précipitations — ce qui arrive

Unité :

**mm/mois**

Elles répondent à :

> **Combien d’eau arrive depuis l’atmosphère ?**

Elles doivent être visibles sans dominer toute la figure.

---

## 5.2 Stock d’eau modélisé dans le premier mètre du sol — ce que le sol garde

C’est le **signal central** de l’infographie.

Le stock est dérivé des trois premières couches ERA5-Land :

- 0–7 cm ;
- 7–28 cm ;
- 28–100 cm.

Le produit doit parler de :

> **Stock d’eau modélisé dans les 0–100 cm**

et non de :

> « réserve utile »  
> « eau disponible pour les plantes ».

Cette distinction est impérative.

Cette variable doit permettre de voir :

- remplissage hivernal ;
- niveau de réserve au printemps ;
- dessèchement estival ;
- recharge automnale ;
- déplacement éventuel de ces phases entre les deux décennies.

---

## 5.3 Évapotranspiration réelle — ce qui repart vers l’atmosphère

Unité :

**mm/mois**

Elle représente l’eau quittant la surface par :

- évaporation ;
- interception ;
- transpiration végétale.

Elle ne doit pas être codée comme un « risque ».

C’est une composante normale du cycle de l’eau.

---

## 5.4 SPEI-3 — état de déficit ou d’excédent climatique

Le SPEI-3 apporte la lecture synthétique :

- positif : conditions relativement humides ;
- proche de zéro : proche de la référence ;
- négatif : conditions relativement sèches.

Il répond à :

> **Les apports en eau compensent-ils encore la demande climatique ?**

Le SPEI-3 ne remplace ni la pluie ni l’humidité du sol.  
Il complète leur lecture.

---

# 6. Concept visuel général

Le visuel doit être construit autour de **deux profils hydriques annuels distincts** :

```text
1996–2005
2016–2025
```

Ils sont alignés sur le même axe :

```text
JAN FÉV MAR AVR MAI JUN JUL AOÛ SEP OCT NOV DÉC
```

L’objectif est que le lecteur compare immédiatement les deux périodes, comme il compare déjà les deux bandes dans **« Les saisons se déplacent »**.

Les deux profils doivent rester séparés.

Ils ne doivent pas être fusionnés dans une grande surface unique.

---

# 7. Composition recommandée

## En-tête

Reprendre la structure visuelle des deux infographies existantes.

### Titre

**L’eau au fil de l’année**

### Sous-titre

**La pluie n’est qu’une partie de l’histoire.**

### Métadonnée

**1996–2025 · référence 1991–2020 · ERA5-Land + ERA5-Drought**

Le sous-titre peut évoluer après observation des données, mais il doit rester court.

---

# 8. La bande hydroclimatique

Chaque décennie est représentée par une **bande hydroclimatique horizontale**.

Elle comprend trois niveaux étroitement liés.

## Niveau supérieur — précipitations

De petites barres verticales montent au-dessus de la bande.

Elles représentent :

```text
précipitations médianes mensuelles
```

La hauteur est proportionnelle aux mm/mois.

Les barres doivent rester fines et régulières.

Couleur recommandée :

```text
#2166AC
```

ou un bleu légèrement plus clair si nécessaire.

La pluie doit être identifiable immédiatement sans transformer la figure en histogramme classique dominant.

---

## Niveau central — eau stockée dans le sol

C’est l’élément visuel principal.

Créer une **bande continue**, dont la hauteur ou la forme suit le stock d’eau médian modélisé dans les 0–100 cm.

Cette bande doit donner une impression de :

- remplissage ;
- maintien ;
- vidange ;
- recharge.

Elle ne doit pas imiter littéralement une rivière.

Il s’agit d’un profil scientifique abstrait, cohérent avec le langage graphique déjà utilisé.

### Couleur

Le niveau absolu est porté par la géométrie.

La couleur peut traduire la position relative par rapport à la normale mensuelle :

```text
plus humide
    ↓
bleu
    ↓
blanc chaud
    ↓
beige / brun
    ↓
plus sec
```

Palette suggérée :

```text
humide fort     #2166AC
humide léger    #92C5DE
normal           #FBFAF7
sec léger        #E6C7A3
sec marqué       #9A6238
```

Contrairement à l’empreinte climatique, le rouge n’est pas nécessaire ici.

L’identité de cette infographie repose sur :

> **bleu de l’eau → blanc neutre → brun du sol sec**

---

## Niveau inférieur — évapotranspiration

Sous la bande du sol, représenter l’évapotranspiration réelle avec une forme plus discrète.

Possibilités :

- petites barres descendantes ;
- petite aire inversée ;
- ligne épaissie sous le stock.

La forme doit être clairement subordonnée au stock du sol.

Couleur :

```text
ocre doux
ou
gris chaud
```

Exemple :

```text
#A67C52
```

Elle doit exprimer un flux sortant sans suggérer une alerte.

---

# 9. Bande SPEI-3

Sous chaque profil hydrique, ajouter une bande horizontale très fine.

Elle correspond au SPEI-3 mensuel médian.

Lecture :

```text
bleu  = plus humide
clair = proche de la normale
brun  = plus sec
```

Cette bande doit être visuellement proche de la logique de **L’empreinte climatique du lieu** :

- continue ;
- discrète ;
- interprétable immédiatement.

Elle sert de synthèse du déficit climatique.

Elle ne doit pas prendre la place du graphique principal.

---

# 10. Lecture verticale d’un mois

Le lecteur doit pouvoir prendre un mois, par exemple juillet, et lire verticalement :

```text
JUILLET

pluie
↓
stock du sol
↓
évapotranspiration
↓
SPEI-3
```

Il doit ensuite comparer le même mois entre les deux décennies.

Cette synchronisation est essentielle.

---

# 11. Comparaison entre les deux décennies

La composition doit rendre visibles trois types de changement.

## Déplacement dans le temps

Exemple :

- dessèchement du sol plus précoce ;
- recharge plus tardive.

## Changement d’intensité

Exemple :

- minimum estival plus bas ;
- évapotranspiration plus forte.

## Changement de durée

Exemple :

- SPEI négatif pendant davantage de mois ;
- période de faible réserve plus longue.

La figure doit permettre de voir ces transformations avant même de lire les chiffres.

---

# 12. Bloc synthétique à droite

Comme dans **L’empreinte climatique du lieu**, un petit bloc à droite peut résumer les changements principaux.

Ne pas dépasser **trois informations**.

Pour la V1, privilégier des métriques robustes et faciles à expliquer.

Exemple de structure :

```text
Écart entre
les décennies

Pluie annuelle
−X %

Stock du sol en été
−XX mm

Déficit SPEI-3
+X mois
```

Les valeurs ci-dessus sont uniquement des exemples de forme.

Aucune valeur fictive ne doit être intégrée dans le produit final.

---

# 13. Indicateur signature

Si les données le permettent, un indicateur plus éditorial peut être mis en avant :

> **Le sol se dessèche XX jours plus tôt**

ou :

> **La recharge automnale arrive XX jours plus tard**

Mais cet indicateur ne doit apparaître que lorsque son algorithme a été précisément défini et validé.

Pour la première version, il est préférable de rester sur :

- cumul saisonnier ;
- niveau médian du stock ;
- durée mensuelle du déficit SPEI.

---

# 14. Style graphique commun avec les deux premières infographies

Les deux SVG fournis définissent déjà une identité claire.

## Fond

```text
#C5C4C1
```

## Texte principal

```text
#24313A
```

## Texte secondaire

```text
#52616A
```

## Blanc chaud

```text
#FBFAF7
```

## Bleu principal

```text
#2166AC
```

## Ombre

```text
#1C2529
```

avec opacité faible, autour de :

```text
0.20 à 0.22
```

## Police

```text
system-ui,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
sans-serif
```

## Titre

Environ :

```text
23 px
font-weight: 650
```

## Sous-titre

Environ :

```text
12–14 px
```

Le troisième graphique doit pouvoir être posé à côté des deux premiers et être immédiatement reconnu comme appartenant à la même série.

---

# 15. Ombres et relief

Le relief graphique doit rester très léger.

Comme dans les infographies existantes :

- fond gris ;
- éléments clairs ou colorés légèrement détachés ;
- ombre courte ;
- aucun effet 3D décoratif.

La bande de stock d’eau peut recevoir une ombre légère afin de renforcer son statut d’élément principal.

Les barres de pluie et d’évapotranspiration ne doivent pas avoir chacune leur propre ombre.

---

# 16. Pas de coins arrondis décoratifs

Conserver le vocabulaire graphique déjà retenu :

```text
rx = 0
ry = 0
```

ou quasi nul.

L’infographie doit ressembler à une figure éditoriale scientifique, pas à une collection de cartes d’interface.

---

# 17. Échelle temporelle

Les douze mois doivent partager exactement la même largeur et les mêmes positions entre les deux décennies.

Si la géométrie est calculée en jours, les mois peuvent conserver leur longueur réelle.

Pour la lecture publique, la priorité est l’alignement parfaitement stable de :

```text
JAN → DÉC
```

entre les deux profils.

---

# 18. Dispersion interannuelle

Les valeurs décennales ne doivent pas donner l’impression d’une année parfaitement déterministe.

Pour chaque variable, conserver dans les données :

```text
P25
médiane
P75
```

Dans le SVG, la dispersion peut être représentée très discrètement :

- halo fin ;
- zone translucide ;
- intervalle au survol.

La figure principale doit rester lisible.

Si la dispersion surcharge le rendu, afficher :

- médiane dans le SVG ;
- P25/P75 dans le tooltip et le HTML.

---

# 19. Tooltip

Chaque mois doit pouvoir fournir des détails au survol.

Exemple :

```text
Août · 2016–2025

Précipitations
42 mm/mois
P25–P75 : …

Stock d’eau 0–100 cm
XXX mm
écart à 1991–2020 : …

Évapotranspiration
XX mm/mois

SPEI-3
−0,82
```

Ajouter :

```text
Sources :
ERA5-Land / ERA5-Drought
```

Ne pas mettre toutes ces informations en texte permanent dans le SVG.

---

# 20. Neige et fonte

La neige est un module **adaptatif**.

Si elle joue un rôle significatif dans le climat du lieu :

- distinguer éventuellement la part neigeuse des précipitations ;
- conserver la fonte dans le tooltip ou dans un détail ;
- montrer que l’eau peut être stockée temporairement sous forme de neige avant d’être libérée.

Si la neige est marginale :

> ne rien afficher.

L’infographie doit s’adapter au lieu.

---

# 21. Ruissellement

Le ruissellement ERA5-Land doit rester un indicateur secondaire.

Il peut être :

- disponible au survol ;
- présent dans le JSON ;
- utilisé plus tard dans une version expert.

Ne pas l’utiliser comme équivalent du débit d’une rivière.

Le graphique climatique ne doit jamais afficher :

> **débit du cours d’eau**

à partir du runoff ERA5-Land.

---

# 22. Ce que l’infographie ne montre pas

Le produit doit explicitement éviter plusieurs confusions.

Il ne montre pas directement :

- la recharge d’une nappe ;
- le débit d’une rivière ;
- l’eau potable disponible ;
- la réserve utile agronomique réelle ;
- l’humidité mesurée sur la parcelle ;
- les besoins d’irrigation ;
- la disponibilité réelle de l’eau pour une plante particulière.

Ces informations demandent d’autres données :

- BRGM ;
- ADES ;
- stations hydrologiques ;
- pédologie ;
- végétation ;
- agriculture.

---

# 23. Phrase de synthèse dynamique

Comme pour l’empreinte climatique, une phrase courte peut être générée à partir des résultats réels.

Exemples de forme :

> **Les pluies annuelles changent peu, mais le sol se dessèche plus tôt au printemps et reste plus sec en été.**

ou :

> **La baisse des précipitations estivales s’accompagne d’une réserve du sol plus faible et d’un déficit climatique plus durable.**

ou :

> **Aucun déplacement net du cycle hydrique n’apparaît entre les deux décennies.**

La phrase doit dépendre des données.

Ne jamais imposer le récit attendu du changement climatique au lieu.

---

# 24. Hiérarchie éditoriale finale

Le graphique doit pouvoir être lu à trois niveaux.

## Niveau 1 — en trois secondes

Le lecteur voit :

- deux périodes ;
- les mois ;
- où arrive l’eau ;
- quand le sol est plein ou sec ;
- si la période sèche s’est allongée.

## Niveau 2 — en trente secondes

Le lecteur comprend :

- pluie ;
- réserve du sol ;
- évapotranspiration ;
- SPEI.

## Niveau 3 — lecture experte

Le HTML et les tooltips donnent :

- valeurs ;
- P25/P75 ;
- méthode ;
- résolution ;
- point de grille ;
- qualité ;
- provenance.

---

# 25. Structure schématique proposée

```text
L’EAU AU FIL DE L’ANNÉE
La pluie n’est qu’une partie de l’histoire.
1996–2025 · référence 1991–2020 · ERA5-Land + ERA5-Drought


                     JAN FÉV MAR AVR MAI JUN JUL AOÛ SEP OCT NOV DÉC

1996–2005     pluie   │ │  ││ │ │││ │  │
                      ↓ ↓  ↓↓ ↓ ↓↓↓ ↓  ↓

                ┌─────────────────────────────────────────────┐
stock du sol    │        réserve hydrique modélisée           │
                └─────────────────────────────────────────────┘

évapotransp.          ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾

SPEI-3         ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬


2016–2025     pluie   │ │ │ ││ │ │ │  │
                      ↓ ↓ ↓ ↓↓ ↓ ↓ ↓  ↓

                ┌─────────────────────────────────────────────┐
stock du sol    │        réserve hydrique modélisée           │
                └─────────────────────────────────────────────┘

évapotransp.          ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾ ▾

SPEI-3         ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬


                                             ÉCART ENTRE
                                             LES DÉCENNIES

                                             Pluie annuelle
                                             −X %

                                             Stock en été
                                             −XX mm

                                             Déficit
                                             +X mois
```

Ce schéma est uniquement une **composition fonctionnelle**.

Le renderer final doit être beaucoup plus compact et harmonieux.

---

# 26. Ce qui doit rester hors du SVG

L’explication complète doit être dans le HTML.

## « Comment lire »

Expliquer :

- précipitations ;
- stock 0–100 cm ;
- évapotranspiration ;
- SPEI-3.

## « Ce que représentent les données »

Expliquer :

- réanalyse ;
- maille ;
- résolution ;
- point de grille ;
- limite en terrain complexe.

## « Sources »

Afficher :

- ERA5-Land ;
- ERA5-Drought ;
- référence 1991–2020 ;
- période de comparaison.

Le SVG doit rester aussi synthétique que **L’empreinte climatique du lieu** et **Les saisons se déplacent**.

---

# 27. Critères de réussite produit

L’infographie est réussie si un lecteur peut répondre sans lire la méthodologie complète à ces quatre questions :

1. **Quand tombe l’eau ?**
2. **Quand le sol possède-t-il sa réserve maximale et minimale ?**
3. **Quand l’eau repart-elle le plus vers l’atmosphère ?**
4. **La période de déficit est-elle différente aujourd’hui de celle du début de la série ?**

Elle est scientifiquement correcte si elle ne laisse jamais croire que :

- la réanalyse est une mesure locale ;
- le stock ERA5-Land est la réserve utile réelle ;
- SPEI est une mesure de l’humidité du sol ;
- runoff est le débit de la rivière ;
- `P − ET` est directement la recharge de nappe.

---

# 28. Résumé du produit

## Nom

**L’eau au fil de l’année**

## Question

> **Comment le rythme annuel des apports, du stockage dans le sol et du déficit hydrique a-t-il changé autour de ce lieu ?**

## Comparaison

**1996–2005 vs 2016–2025**

## Référence

**1991–2020**

## Variables principales

- précipitations ;
- stock d’eau modélisé 0–100 cm ;
- évapotranspiration réelle ;
- SPEI-3.

## Sources

- ERA5-Land ;
- ERA5-Drought.

## Grammaire graphique

- fond gris neutre ;
- deux profils horizontaux distincts ;
- pluie en bleu ;
- stock du sol comme bande centrale ;
- évapotranspiration discrète sous la bande ;
- SPEI en bande fine bleu → blanc → brun ;
- ombre légère ;
- aucun décor non informatif ;
- même typographie et même hiérarchie que les deux premières infographies.

## Message attendu

> **La pluie dit ce qui arrive. Le sol montre ce qui reste. L’évapotranspiration montre ce qui repart. Le SPEI révèle quand le déficit s’installe.**
