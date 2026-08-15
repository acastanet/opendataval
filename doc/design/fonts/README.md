# Polices du référentiel Style VAL

```bash
node doc/design/fonts/fetch-fonts.mjs
```

C'est tout. Le script dépose `SourceSerif4-Variable.woff2` et `Inter-Variable.woff2`
dans ce dossier, vérifie que les fichiers reçus sont bien des woff2 (et non une page
d'erreur HTML renommée), et sort en succès même en cas d'échec réseau.

## Pourquoi les binaires ne sont pas versionnés

| | |
| --- | --- |
| Auto-hébergées, jamais Google | `fonts.gstatic.com` transmet l'IP des visiteurs à un tiers — intenable pour un service public territorial. |
| Non versionnées | ~770 Ko de binaires, re-téléchargeables en une commande. |
| Non bloquantes | **La pile de repli système est la référence de base.** La police web est une amélioration, pas une dépendance. |

## Le référentiel fonctionne sans ces fichiers

`@font-face` déclare `local()` en premier : si la police est installée sur le poste,
elle est utilisée sans téléchargement. Sinon, les piles de repli prennent le relais :

- **Titres** — Charter, Sitka Text, Cambria, Georgia, `ui-serif`
  (couvre macOS, Windows et iOS nativement)
- **Texte** — `ui-sans-serif`, `system-ui`, Segoe UI

La section *Typographie* du référentiel affiche en permanence un indicateur qui dit
laquelle des deux rend réellement. C'est précisément le défaut de la v2.0 qui est ainsi
rendu impossible : elle déclarait Inter dans ses tokens sans jamais la charger, et le
texte s'affichait en Segoe UI sans que personne puisse s'en apercevoir.

## Sources et licences

| Fichier | Police | Licence | Origine |
| --- | --- | --- | --- |
| `SourceSerif4-Variable.woff2` | Source Serif 4 (variable, Roman) | SIL OFL 1.1 | [adobe-fonts/source-serif](https://github.com/adobe-fonts/source-serif) |
| `Inter-Variable.woff2` | Inter (variable) | SIL OFL 1.1 | [rsms/inter](https://github.com/rsms/inter) |

Les deux licences autorisent explicitement la redistribution et l'hébergement.

## Sous-ensemblement

Si le poids pose problème, le latin étendu suffit pour le français :
`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+20AC`. Ne pas oublier
les guillemets `«` `»` et l'apostrophe typographique `’`, utilisée partout dans le
référentiel.
