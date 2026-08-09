# Changelog visuel V5 — « Les saisons se déplacent »

Modification strictement visuelle du renderer SVG. La couche scientifique reste
inchangée : méthode T25/T75, données ERA5-Land, dates, médianes, P25–P75,
écarts, durée d'été et JSON.

## Changements

- deux bandes calendaires blanches sont ajoutées : saisons météorologiques
  fixes, puis mois ;
- les bandes de 1996–2005 et 2016–2025 prennent une palette pastel : hiver
  bleu, printemps rose, été vert et automne orange ;
- les annotations et connecteurs entre les bandes sont supprimés ;
- les frontières de saison et de mois deviennent des traits fins pointillés ;
- l'incertitude P25–P75 est une zone grise discrète, bornée par des pointillés ;
- autour de chaque médiane, un dégradé pastel → blanc → pastel rend la
  transition visible sans la présenter comme une date exacte ; il débute et se
  termine sur les traits P25 et P75 ;
- les médianes et les liens entre les deux décennies sont rouges pointillés ;
- les saisons de référence suivent les dates astronomiques usuelles (été à
  partir du 21 juin), et non les premiers jours des mois.
- les quatre bandes ont désormais la même hauteur et le même espacement ; les
  libellés hivernaux de fin de bande, redondants, sont retirés ;
- le détail de période sous « +29 jours » est supprimé.

## Palette

| Saison | Couleur |
|---|---|
| Hiver | `#8DEBFF` — bleu surligneur |
| Printemps | `#FF9FC7` — rose surligneur |
| Été | `#C7F36B` — vert surligneur |
| Automne | `#FFC45C` — orange surligneur |

Lecture visée : **les repères calendaires restent stables alors que les saisons
thermiques se déplacent**. Les zones grises pointillées indiquent la dispersion
des dates ; le centre blanc évite de présenter une transition comme nette.
