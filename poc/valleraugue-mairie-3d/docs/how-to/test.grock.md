# Propositions d'améliorations — POC 3D Valleraugue

Notes de travail issues d'une revue de l'état du POC (branche
`agent/ameliore-rendu-poc-3d`, vagues A–F livrées, vague 3 en cours).

Références :

- [`../ameliorations-3d.md`](../ameliorations-3d.md) — pistes mesurées et plafonds
- [`../acceptance-checklist.md`](../acceptance-checklist.md) — grille d'acceptation
- [`../ux-visualiseur.md`](../ux-visualiseur.md) — refonte d'interface

---

## Contexte rapide

Le rapport d'améliorations a déjà clos le gros du rendu géométrique :

| Déjà livré | À ne plus pousser |
| --- | --- |
| Terrain 0,5 m, végétation, occlusion cuite, LoD1 sur toitures dégradées, eau/pont | Ortho plus fine, terrain 0,25 m, Draco/KTX2, textures de façades, mode « réaliste » |
| UX à deux niveaux, recherche `cleabs`, ombres en cascades | Dé-ombrage de l'ortho, réparation des toitures Roofer |

Le vrai levier n'est plus « inventer une nouvelle piste 3D », c'est **fermer la
vague 3, valider à l'écran, puis quelques gains ciblés**.

---

## 1. Priorité immédiate — finir ce qui est ouvert

### A. Clore la vague 3 (déjà codée, pas encore validée)

Travail en cours sur la branche : relief des houppiers
(`VEGETATION_CROWN_IRREGULARITY`), ombrage feuillage basculable, courbe de rendu
(Neutre / AgX / ACES).

**À faire :**

1. Recette visuelle 200 m **puis** 600 m (le 600 m a 63 % de canopée : c'est le
   vrai stress test).
2. Décider si le `filter: contrast()` CSS reste utile une fois AgX/ACES essayés.
3. Cocher la section « Vague 3 » de la checklist.
4. Si les houppiers se lisent en cailloux sur le 600 m →
   `VEGETATION_CROWN_IRREGULARITY=0` et figer.

**Effort :** bas · **Impact :** ferme le dernier lot de rendu.

### B. Passer la grille d'acceptation (le plus gros écart document/réalité)

Beaucoup de cases non cochées ne sont **pas des features manquantes** : contact
terrain/bâti, occlusion, soleil, sélecteur de scènes, interface. Ce sont des
contrôles manuels jamais reportés.

**Proposition :** une session de recette structurée (1–2 h) sur `output-200m` +
`output-600m`, avec report dans `acceptance-checklist.md`. Ça vaut plus qu'une
nouvelle feature pour un POC « GO / NO-GO ».

**Effort :** bas · **Impact :** crédibilité de la démo.

---

## 2. Gains utiles encore ouverts (effort faible / moyen)

### C. Qualité de la démo multi-scènes

Les scènes Notre-Dame / Creyssensac existent, mais le sélecteur et le
basculement d'emprise restent non validés (cases 178–190 de la checklist).

**Améliorations concrètes :**

- Garantir qu'un basculement rapide n'affiche jamais l'ancienne scène et ne fuit
  pas en GPU (déjà listé, à prouver).
- Afficher dans le sélecteur un **indicateur de fraîcheur** (date du `run-*` ou
  hash du GLB) pour éviter de publier une interface à jour sur une scène
  périmée — le piège documenté dans la publication.
- POV « Mairie » générique → renommer en « Centre » / label de
  `SCENE_CENTRE_LABEL` pour les scènes hors Valleraugue.

**Effort :** bas · **Impact :** démo multi-sites plus honnête.

### D. Outil de contrôle géométrique (usage « expert »)

Le visualiseur sert deux usages (découverte / contrôle). Le second peut encore
gagner sans alourdir le premier :

| Idée | Pourquoi |
| --- | --- |
| **Export PNG de la vue courante** (touche ou bouton expert) | comparer deux `poc.py all` sans capture OS |
| **Compteur FPS discret** (expert, off par défaut) | juger les cascades d'ombres sur 600 m |
| **Liste des 15 bâtiments LoD1** cliquable depuis le mode Qualité | aujourd'hui on a la recherche `cleabs`, pas le parcours des cas signalés |
| **Diff caméra** : coller une pose `P` et y revenir | la touche `P` exporte déjà ; il manque le « coller / aller à » |

**Effort :** bas à moyen · **Impact :** accélère les recettes entre runs.

### E. Robustesse pipeline / publication

Points déjà douloureux dans la doc :

1. **`lancer.bat` / `poc.py web` avant serve** — déjà corrigé ; s'assurer que la
   publication Tailscale refuse un `web/` plus vieux que les sources `viewer/*`
   (horodatage ou hash).
2. **Scène sans `SCENE_TITLE`** — déjà refuse le sélecteur ; un `poc.py check`
   qui échoue si un `.conf` versionné n'a pas son `.example` à jour (le test
   existe pour les clés, pas toujours pour l'identité de scène).
3. **Rapport de validation lisible** — remonter en tête : nb toitures dégradées,
   calage ortho (m), nb arbres typés BD Forêt, facteur d'occlusion médian.
   Aujourd'hui l'info est dispersée.

**Effort :** bas · **Impact :** moins de fausses démos.

---

## 3. Pistes de rendu encore intéressantes (si on rouvre le sujet)

À n'engager **qu'après** A + B, et seulement si la recette le demande.

### F. Végétation sur le 600 m — le vrai prochain écart visuel

Sur 200 m : 27 % sous canopée. Sur 600 m : **63 %**. Les proxys individuels
tiennent moins bien un couvert continu.

Pistes mesurables, dans l'esprit du POC :

- **Couche de canopée basse densité** (mesh ou extrusions sur `canopy.npy`) sous
  les proxys pour les plages denses, proxys seuls en lisière.
- Seuil de densification : au-delà de N cimes/ha, basculer en « massif » plutôt
  qu'en grappe de boules.
- Ne pas monter la densité de cimes : le rapport a déjà tranché (358 vs 443)
  pour éviter les grappes sur un même houppier.

**Effort :** moyen · **Impact :** fort sur 600 m, faible sur 200 m.

### G. Contact terrain / bâti (checklist encore ouverte)

Si la recette en lumière rasante montre encore des traversées amont /
flottements aval :

- affiner le **fondu d'assise** (déjà paramétré) plutôt que remonter la
  résolution ;
- éventuellement masquer la **tranche de dalle** du terrain (matériau double
  face / jupe de bord) — case 36 encore ouverte.

**Effort :** moyen · **Impact :** fort en vue rasante, zéro en vue générale.

### H. Cohérence ombres ortho / ombres 3D

`poc.py sun` existe ; la checklist d'éclairage est presque entièrement non
cochée. Avant tout nouvel effet lumineux :

1. figer l'azimut/hauteur mesurés par scène dans le `scene.json` ;
2. option « verrouiller le soleil sur la mesure » dans le visualiseur (au lieu
   de le laisser libre puis se plaindre de l'incohérence).

**Effort :** bas · **Impact :** la démo « prolonge les ombres de l'ortho » devient
démontrable.

---

## 4. Ce que l'on déconseille (confirmé par le rapport)

| Piste | Motif |
| --- | --- |
| Ortho plus grande / couche HR | saturée à ~20 cm, déjà sur-échantillonnée |
| Textures de murs procédurales | essayées vague 1, gain insuffisant |
| Seconde chaîne de rendu (Preetham, GTAO) | retirée après comparaison |
| Dé-ombrage de l'ortho | bas, inpainting, sur-ingénierie |
| Réparer les toitures Roofer | LoD1 honnête > toiture inventée |
| Draco / tuilage / LOD web | industrialisation, pas qualité sur 200–600 m local |
| WCAG AA, lib UI, caméra ortho | hors périmètre assumé |

---

## 5. Ordre recommandé

```text
1. Recette vague 3 (200 m → 600 m) + décision contraste CSS
2. Session checklist acceptation (contact, soleil, UI, sélecteur)
3. Petits outils expert : export PNG, liste LoD1 cliquable, pose caméra collable
4. Si 600 m trop « peigné » : massif de canopée sous les proxys denses
5. Seulement si rasante échoue : fondu d'assise / tranche de dalle
```

---

## En une phrase

Le POC n'a plus besoin d'une « grande feature 3D » : il a besoin d'une **recette
qui ferme la vague 3 et la checklist**, puis éventuellement d'un **traitement du
couvert dense à 600 m** et de **trois raccourcis d'usage expert**.

Lots possibles pour la suite :

- recette vague 3 ;
- liste cliquable des bâtiments LoD1 ;
- plan concret pour la canopée dense du 600 m.
