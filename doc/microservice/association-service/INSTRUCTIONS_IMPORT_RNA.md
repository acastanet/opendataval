# Mission — Raccorder association-service aux données RNA réelles

## 1. Contexte

OpenDataVal dispose d’un microservice `association-service` chargé de fournir une
liste consolidée, recherchable et cartographiable des associations d’une commune
française. Le premier périmètre couvre Val-d’Aigoual :

- code INSEE actuel : `30339` ;
- ancienne commune de Valleraugue : désormais incluse dans `30339` ;
- ancienne commune de Notre-Dame-de-la-Rouvière : code historique `30190`,
  à rattacher à `30339`.

Le service fonctionne sans base de données. Il lit un snapshot JSON compressé
depuis un volume persistant et conserve le dernier snapshot valide lorsqu’une
synchronisation échoue.

Le code principal se trouve dans :

- `apps/association-service/src/sync.ts` : téléchargement et transformation ;
- `apps/association-service/src/store.ts` : persistance atomique du snapshot ;
- `apps/association-service/src/app.ts` : routes HTTP ;
- `apps/association-service/src/normalization.ts` : communes, statuts et dates ;
- `apps/association-service/src/types.ts` : contrat du snapshot ;
- `apps/association-service/test/` : tests et fixture.

### Mandat d’autonomie

La personne ou l’agent chargé de cette mission doit la conduire de bout en bout
sans demander de validation intermédiaire pour les choix techniques ordinaires.
La présente instruction autorise explicitement à :

- inspecter tout le dépôt et l’historique Git en lecture seule ;
- modifier `apps/association-service/` ;
- modifier les fichiers d’intégration strictement nécessaires :
  `.env.example`, `docker-compose.yml`, `package.json`, `pnpm-lock.yaml`, le
  gateway et la documentation du service ;
- ajouter une dépendance npm maintenue pour lire les CSV en flux, après avoir
  vérifié qu’elle est compatible avec Node.js 22 et les modules ES ;
- créer des fixtures synthétiques réduites ne contenant aucune donnée
  personnelle réelle ;
- télécharger en lecture seule les ressources publiques officielles ;
- construire et redémarrer les seuls conteneurs nécessaires aux tests locaux ;
- faire les choix d’implémentation qui respectent les contraintes et critères
  d’acceptation ci-dessous.

Il n’est pas nécessaire de demander :

- quel parseur CSV choisir ;
- comment découper les modules internes ;
- quels noms donner aux fonctions privées ;
- s’il faut ajouter ou renforcer un test directement lié à la mission ;
- s’il faut corriger un défaut découvert dans le périmètre de
  `association-service`.

En revanche, ne pas :

- modifier ou supprimer des changements locaux sans rapport avec la mission ;
- réinitialiser le dépôt ou nettoyer globalement le workspace ;
- déployer en production ;
- pousser une branche, ouvrir une PR ou créer un commit sans demande explicite ;
- ajouter au dépôt un fichier national, un snapshot, un cache, un fichier
  temporaire ou un secret.

Au démarrage, exécuter `git status --short --branch` et considérer tout
changement préexistant comme appartenant à l’utilisateur. Travailler autour de
ces changements et signaler dans la synthèse finale les fichiers préexistants
qui ont empêché une modification nécessaire.

## 2. Problème à résoudre

Le synchroniseur actuel accepte uniquement un petit CSV déjà normalisé, séparé
par des points-virgules, avec des colonnes telles que :

```text
id_rna;id_waldec;titre;objet;etat;code_insee;libelle_commune
```

Les données RNA officielles ne suivent pas ce format :

- elles sont publiées dans deux extractions, `Waldec` et `Import` ;
- les CSV nationaux sont séparés par des virgules ;
- les colonnes utilisent notamment `id`, `titre`, `objet`,
  `adrs_codeinsee`, `adrs_codepostal`, `adrs_libcommune` et `position` ;
- les fichiers nationaux sont volumineux ;
- les valeurs de statut officielles utilisent notamment `A` et `D`.

Il ne faut donc pas simplement placer l’URL d’un CSV national dans
`RNA_SOURCE_URL`. Le code actuel charge toute la réponse avec `response.text()`,
ce qui n’est pas acceptable pour un fichier de plusieurs centaines de Mo ou
plusieurs Go.

## 3. Objectif de la mission

Implémenter un import RNA réel, reproductible et économe en mémoire qui :

1. lit les extractions officielles Waldec et Import ;
2. ne conserve que les associations rattachées à Val-d’Aigoual ;
3. reconnaît les codes et noms historiques de la commune ;
4. convertit les colonnes officielles vers `AssociationSummary` ;
5. fusionne et déduplique les deux extractions ;
6. géocode uniquement les associations retenues ;
7. construit un snapshot valide ;
8. remplace atomiquement le snapshot courant ;
9. conserve le snapshot précédent en cas d’échec ;
10. expose immédiatement les nouvelles données sans redémarrage manuel.

## 4. Sources officielles

Jeu de données agrégé :

```text
https://www.data.gouv.fr/datasets/rna-agrege-a-lechelle-nationale
```

Ressources CSV actuellement utilisées par data.gouv.fr :

```text
Waldec :
https://www.data.gouv.fr/api/1/datasets/r/91fd139b-4c2a-4d36-b05b-8607b41f1202

Import :
https://www.data.gouv.fr/api/1/datasets/r/66e052d8-e387-443e-8f43-2916d17022fb
```

Ces URL de ressources peuvent évoluer. La solution doit permettre de les
configurer par variables d’environnement et ne doit pas les disperser dans le
code.

Avant l’implémentation, vérifier les métadonnées et les en-têtes actuels. Pour
une inspection ponctuelle, ne télécharger que le début de chaque ressource :

```powershell
curl.exe -L --fail --range 0-8191 `
  "https://www.data.gouv.fr/api/1/datasets/r/91fd139b-4c2a-4d36-b05b-8607b41f1202"

curl.exe -L --fail --range 0-8191 `
  "https://www.data.gouv.fr/api/1/datasets/r/66e052d8-e387-443e-8f43-2916d17022fb"
```

Si une URL ne fonctionne plus :

1. consulter le jeu de données agrégé indiqué ci-dessus ;
2. retrouver les ressources CSV Waldec et Import les plus récentes ;
3. ne pas bloquer l’implémentation sur un identifiant de ressource historique ;
4. conserver les URL finales configurables ;
5. documenter les URL effectivement testées et leur date de vérification.

Variables proposées :

```dotenv
RNA_WALDEC_SOURCE_URL=
RNA_IMPORT_SOURCE_URL=
ASSOCIATION_GEOCODING_URL=https://data.geopf.fr/geocodage/search
ASSOCIATION_SYNC_TOKEN=
```

Conserver temporairement la compatibilité avec `RNA_SOURCE_URL` si elle est
encore utile pour les fixtures ou les déploiements existants.

### Génération du token de synchronisation

`ASSOCIATION_SYNC_TOKEN` n’est fourni ni par data.gouv.fr ni par GitHub. Il
s’agit d’un secret interne partagé entre l’opérateur et `association-service`,
généré localement pour protéger `POST /internal/v1/associations/sync`.

Sous PowerShell, générer 32 octets aléatoires avec le générateur
cryptographique du système :

```powershell
[Convert]::ToHexString(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).ToLowerInvariant()
```

Copier la valeur obtenue uniquement dans le fichier `.env` local :

```dotenv
ASSOCIATION_SYNC_TOKEN=valeur_hexadecimale_generee
```

Ne jamais copier la valeur réelle dans `.env.example`, un fichier de
documentation, une commande commitée, un ticket ou un journal.

Après modification de `.env`, recréer le conteneur pour charger la variable :

```powershell
docker compose up -d --force-recreate association-service
```

Déclencher ensuite la synchronisation depuis le conteneur, sans recopier le
secret dans la ligne de commande :

```powershell
docker compose exec association-service node -e "const http=require('node:http');const req=http.request({hostname:'127.0.0.1',port:3000,path:'/internal/v1/associations/sync',method:'POST',headers:{authorization:'Bearer '+process.env.ASSOCIATION_SYNC_TOKEN}},res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>{console.log(res.statusCode,body);if((res.statusCode??500)>=400)process.exit(1)})});req.on('error',error=>{console.error(error);process.exit(1)});req.end()"
```

L’import national peut dépasser cinq minutes. Cette commande utilise le client
HTTP natif de Node sans le délai implicite d’attente d’en-têtes de `fetch`.
Attendre sa réponse finale et ne pas relancer la synchronisation pendant qu’elle
travaille.

La commande directe suivante n’utilise pas la route HTTP et ne nécessite donc
pas le token :

```powershell
docker compose exec association-service pnpm sync
```

Si cette commande directe est utilisée, redémarrer ensuite le service pour
recharger en mémoire le snapshot écrit sur le volume :

```powershell
docker compose restart association-service
```

## 5. Contraintes techniques

### Mémoire et téléchargement

- Ne jamais charger un fichier national complet dans une chaîne de caractères.
- Utiliser un traitement en flux, ligne par ligne, ou un job externe capable de
  filtrer les données sans charger le fichier entier en mémoire.
- Fixer des délais réseau explicites.
- Vérifier les codes HTTP et le type de contenu.
- Écrire les téléchargements temporaires dans le répertoire de données ou dans
  un répertoire temporaire contrôlé.
- Nettoyer les fichiers temporaires après succès ou échec.

### CSV

- Utiliser un parseur CSV éprouvé prenant en charge :
  - les virgules dans les valeurs ;
  - les champs entre guillemets ;
  - les guillemets échappés ;
  - les retours à la ligne dans un champ ;
  - les fichiers avec ou sans BOM ;
  - les fins de ligne Windows et Unix.
- Ne pas maintenir un parseur CSV artisanal pour les fichiers nationaux.
- Valider la présence des colonnes obligatoires avant de traiter les lignes.
- Le choix de la dépendance appartient à l’implémenteur. Préférer une
  bibliothèque ciblée, maintenue et compatible avec les flux Node.js plutôt
  qu’un framework de traitement de données complet.
- Ajouter la dépendance avec pnpm depuis la racine et laisser pnpm mettre à jour
  le lockfile, par exemple :

```powershell
pnpm --filter association-service add <paquet-csv>
```

### Filtrage communal

Conserver une ligne lorsqu’au moins un critère officiel permet de la rattacher à :

- `30339` ;
- `30190` ;
- `VAL-D'AIGOUAL` ;
- `VALLERAUGUE` ;
- `NOTRE-DAME-DE-LA-ROUVIERE`.

Les comparaisons de noms doivent être insensibles :

- à la casse ;
- aux accents ;
- aux apostrophes droites ou typographiques ;
- aux espaces multiples ;
- aux traits d’union.

Toutes les associations retenues sont publiées avec
`normalizedCommuneCode = "30339"`. La valeur source d’origine doit être
conservée dans `sourceCommuneCode`.

### Correspondance des colonnes

Définir deux adaptateurs explicites, un pour Waldec et un pour Import. Ne pas
déduire silencieusement le schéma à partir de valeurs approximatives.

Correspondances minimales à vérifier :

| Donnée publique | Waldec / Import | Cible |
|---|---|---|
| Identifiant | `id` | `rnaId` pour Waldec, `legacyId` pour Import |
| Titre | `titre` | `title` |
| Titre court | `titre_court` si présent | `shortTitle` |
| Objet | `objet` | `purpose` |
| Catégories | `objet_social1`, `objet_social2` | catégories publique primaire et secondaire |
| Statut | `position` | `administrativeStatus` |
| Création | `date_creat` | `creationDate` |
| Déclaration | `date_decla` si présente | `declarationDate` |
| Dissolution | `date_disso` si présente | `dissolutionDate` |
| Site web | `siteweb` | `website` |
| SIRET | `siret` | `siret` |
| Code commune | `adrs_codeinsee` | code communal source |
| Code postal | `adrs_codepostal` | `postalCode` |
| Commune | `adrs_libcommune` ou `libcom` | `municipalityName` |
| Mise à jour | `maj_time` | `sourceUpdatedAt` |

Cette table est une base de travail. Vérifier les en-têtes réels des deux
ressources avant d’arrêter le mapping.

Construire `address.label` sans inventer d’information :

- pour Waldec, assembler dans l’ordre les champs d’adresse officielle
  disponibles (`adrs_complement`, numéro, répétition, type et libellé de voie,
  distribution, code postal et commune) ;
- pour Import, assembler `adr1`, `adr2`, `adr3`, le code postal et `libcom` ;
- supprimer uniquement les fragments vides et normaliser les espaces ;
- conserver séparément le code postal, le nom communal et le code INSEE source.

### Statuts

Le mapping minimal attendu est :

| Valeur RNA | Statut public |
|---|---|
| `A` | `active` |
| `D` | `dissolved` |
| absente ou inconnue | `unknown` |

Ne jamais transformer une valeur inconnue en `active`.

### Déduplication

Ordre de priorité :

1. numéro RNA officiel ;
2. identifiant historique Import ;

Ne jamais fusionner deux associations sur leur seul titre.

Le contrat actuel ne possède pas de champ pour un identifiant synthétique. Une
ligne sans identifiant RNA ni identifiant Import doit donc être rejetée et
comptabilisée dans les métriques de qualité, sans élargir silencieusement le
contrat public.

### Géocodage

- Géocoder uniquement les associations déjà filtrées.
- Réutiliser le cache existant.
- Respecter le service de géocodage et limiter les appels.
- Conserver la précision et le score.
- En cas d’échec, utiliser le centroïde communal avec
  `precision = "municipality"`.
- Un échec de géocodage ne doit pas annuler tout le snapshot.

### Sécurité

- Ne jamais commiter de jeton ou de fichier `.env`.
- La synchronisation reste accessible uniquement par la route interne.
- Ne pas publier de données personnelles supplémentaires.
- Ne pas ajouter d’informations sur les dirigeants.
- Conserver uniquement les champs officiellement diffusés par le RNA et prévus
  dans le contrat public.

## 6. Architecture attendue

Séparer les responsabilités :

```text
téléchargement en flux
        ↓
lecture CSV Waldec / Import
        ↓
adaptateurs de schéma
        ↓
filtrage communal
        ↓
normalisation et déduplication
        ↓
géocodage des seules lignes retenues
        ↓
validation du snapshot
        ↓
remplacement atomique
```

Éviter une seule fonction longue réalisant toutes ces opérations.

Les fonctions de transformation pures doivent pouvoir être testées sans réseau
et sans système de fichiers.

### Politique atomique entre les deux sources

Waldec et Import forment ensemble une seule version du snapshot. La règle par
défaut est « tout ou rien » :

- les deux sources doivent être téléchargées, validées et transformées ;
- si une source échoue, le snapshot courant reste inchangé ;
- un résultat combiné vide est invalide ;
- le manifeste doit enregistrer les deux provenances, leurs dates disponibles,
  le nombre de lignes lues, retenues et rejetées, et la date de génération ;
- si le type actuel du manifeste ne permet pas ces informations, le faire
  évoluer avec une migration rétrocompatible de la lecture des anciens
  snapshots.

Ne pas demander de décision supplémentaire sur cette règle, sauf si une
contrainte externe explicite impose un fonctionnement partiel.

## 7. Mode opératoire autonome

Suivre cet ordre sans attendre de validation intermédiaire.

### Phase A — État initial

1. Lire `AGENTS.md`.
2. Exécuter `git status --short --branch`.
3. Lire entièrement les fichiers du service et ses tests.
4. Lancer `pnpm check:associations` pour établir la référence initiale.
5. Noter les échecs préexistants sans les masquer.

### Phase B — Caractérisation des sources

1. Vérifier les URL et les en-têtes réels Waldec et Import.
2. Enregistrer dans des fixtures uniquement quelques lignes synthétiques
   reproduisant fidèlement les en-têtes et cas de syntaxe CSV.
3. Documenter le mapping retenu dans le code ou le README.
4. Ne pas commiter d’extrait contenant une adresse réelle.

### Phase C — Implémentation

1. Ajouter le parseur CSV en flux.
2. Séparer téléchargement, parsing, adaptation, filtrage, déduplication,
   géocodage et écriture.
3. Ajouter les deux URL à la configuration.
4. Préserver la compatibilité du snapshot existant.
5. Implémenter la politique atomique des deux sources.
6. Mettre à jour le store en mémoire lors de la synchronisation HTTP.
7. Mettre à jour Compose, `.env.example` et la documentation.

### Phase D — Boucle de validation

Après chaque groupe cohérent de changements :

1. lancer les tests unitaires concernés ;
2. corriger toute régression introduite ;
3. lancer `pnpm check:associations` ;
4. lancer `pnpm check:gateway` si le contrat, Compose ou le gateway change ;
5. lancer `git diff --check`.

Ne pas supprimer ou affaiblir un test pour obtenir un résultat vert.

### Phase E — Essai réel unique

Lorsque les fixtures et tous les tests sont verts :

1. configurer les deux URL officielles dans l’environnement local ;
2. exécuter une seule synchronisation nationale complète ;
3. ne pas répéter le téléchargement si l’échec provient d’un défaut déjà
   identifié dans le code ;
4. vérifier que le snapshot contient au moins une association et que sa
   provenance mentionne les deux sources ;
5. vérifier liste, recherche, statistiques et carte via le gateway ;
6. ne pas ajouter le snapshot obtenu au dépôt.

Un essai réel peut être omis uniquement si le réseau ou la source officielle est
indisponible après vérification. Dans ce cas, terminer tout ce qui est validable
avec les fixtures et signaler précisément la commande à rejouer. Ne pas déclarer
la mission totalement achevée.

### Phase F — Relecture finale

1. Inspecter `git diff` et `git status`.
2. Vérifier qu’aucun secret, snapshot, cache ou fichier national n’apparaît.
3. Vérifier que les modifications restent dans le périmètre autorisé.
4. Fournir la synthèse demandée dans la section « Livrables ».

## 8. Règles de décision et d’arrêt

### Décisions à prendre sans demander

- Adapter les noms privés et l’organisation des fichiers.
- Choisir une bibliothèque CSV adaptée.
- Ajouter des types, validations, journaux et compteurs de qualité.
- Corriger les mappings quand les en-têtes officiels apportent une réponse
  objective.
- Ajouter les tests nécessaires à tout défaut découvert dans le périmètre.
- Utiliser une valeur par défaut raisonnable pour un délai ou une limite, puis
  la rendre configurable si elle affecte l’exploitation.

### Quand demander une décision

Suspendre uniquement la partie concernée et demander une décision si :

- la source officielle contredit le contrat public de manière impossible à
  résoudre sans supprimer ou exposer des données ;
- une migration destructive du snapshot ou du volume est indispensable ;
- une nouvelle source non prévue ou nécessitant un compte payant est requise ;
- la seule solution implique un déploiement, une écriture distante, un commit
  ou un push non demandé ;
- des changements locaux préexistants chevauchent directement les mêmes lignes
  et ne peuvent pas être préservés.

Avant de demander, épuiser les vérifications sûres, les fixtures et les
alternatives non destructives.

### Échecs non bloquants

Ne sont pas des raisons de suspendre toute la mission :

- une URL officielle temporairement indisponible ;
- un échec de géocodage individuel ;
- l’absence de token de synchronisation pour les tests unitaires ;
- l’indisponibilité de Docker si les tests TypeScript peuvent continuer ;
- un avertissement provenant d’un autre module non modifié.

Documenter ces cas et poursuivre les parties indépendantes.

## 9. Travail demandé

### Étape 1 — Audit

- Relever les en-têtes réels de Waldec et Import.
- Documenter les différences utiles.
- Vérifier les valeurs réelles de `position`, des dates et des codes communaux.
- Identifier les associations correspondant à `30339` et `30190` dans une
  extraction réduite.

### Étape 2 — Contrats et configuration

- Ajouter les variables d’environnement nécessaires.
- Mettre à jour `.env.example`.
- Mettre à jour `AssociationConfig`.
- Conserver une configuration explicite et validée.

### Étape 3 — Import

- Ajouter un lecteur CSV en flux.
- Implémenter les adaptateurs Waldec et Import.
- Implémenter le filtrage communal.
- Fusionner les deux flux.
- Dédupliquer par identifiant officiel.
- Produire le snapshot attendu.

### Étape 4 — Synchronisation

- Préserver le dernier snapshot valide.
- Mettre à jour le store en mémoire après synchronisation.
- S’assurer que la route interne ne nécessite pas un redémarrage.
- Renvoyer une erreur structurée et journaliser la source concernée en cas
  d’échec.

### Étape 5 — Documentation

- Mettre à jour le README du service.
- Donner les commandes exactes de configuration, synchronisation et contrôle.
- Expliquer la provenance et les limites fonctionnelles.

## 10. Tests obligatoires

### Tests unitaires

- adaptation d’une ligne Waldec ;
- adaptation d’une ligne Import ;
- statut `A`, `D` et valeur inconnue ;
- code `30339` ;
- code historique `30190` ;
- reconnaissance des noms historiques ;
- dates valides et invalides ;
- titre ou identifiant obligatoire ;
- déduplication sans fusion par titre ;
- CSV avec virgule, guillemets et retour à la ligne dans un champ.

### Tests d’intégration

- import combiné Waldec + Import depuis deux petites fixtures ;
- exclusion d’une commune hors périmètre ;
- génération d’un snapshot non vide ;
- restauration du snapshot après redémarrage ;
- refus d’un fichier dont les colonnes obligatoires manquent ;
- conservation du snapshot précédent si une source échoue ;
- conservation du snapshot précédent si le snapshot produit est vide ;
- cache de géocodage ;
- mise à jour visible immédiatement après la synchronisation interne.

### Tests HTTP

Vérifier au minimum :

```http
GET /healthz
GET /readyz
GET /api/v2/associations?code_insee=30339
GET /api/v2/associations?code_insee=30339&q=patrimoine
GET /api/v2/associations?code_insee=30339&status=active
GET /api/v2/associations/stats?code_insee=30339
GET /api/v2/associations/map?code_insee=30339
POST /internal/v1/associations/sync
```

Tester également :

- code INSEE invalide ;
- limite supérieure à 100 ;
- curseur invalide ;
- snapshot indisponible ;
- association inconnue ;
- jeton interne absent ou incorrect.

## 11. Commandes de validation

Depuis la racine du dépôt :

```bash
pnpm check:associations
pnpm check:gateway
git diff --check
```

Avec Docker :

```bash
docker compose up -d --build association-service gateway caddy
curl -fsS "http://localhost:8080/api/v2/status"
curl -fsS "http://localhost:8080/api/v2/associations?code_insee=30339"
curl -fsS "http://localhost:8080/api/v2/associations/stats?code_insee=30339"
curl -fsS "http://localhost:8080/api/v2/associations/map?code_insee=30339"
```

Ne pas lancer une synchronisation nationale répétée pendant les tests. Utiliser
des fixtures locales réduites et déterministes.

## 12. Critères d’acceptation

La mission est terminée lorsque :

- les deux sources officielles sont prises en charge ;
- aucun fichier national complet n’est chargé en mémoire ;
- Val-d’Aigoual et ses anciennes communes sont correctement consolidées ;
- les statuts RNA sont correctement interprétés ;
- le snapshot contient des données réelles et une provenance explicite ;
- le dernier snapshot valide survit à toute erreur de synchronisation ;
- la synchronisation met à jour le service sans redémarrage ;
- les routes liste, recherche, fiche, statistiques et carte fonctionnent via le
  gateway ;
- le badge Associations de l’accueil devient disponible après import ;
- tous les tests ciblés et `git diff --check` réussissent ;
- aucun secret, cache de données ou snapshot généré n’est ajouté au dépôt.

La checklist suivante doit être renseignée dans la synthèse finale :

```text
[ ] Waldec traité en flux
[ ] Import traité en flux
[ ] Mapping vérifié sur les en-têtes actuels
[ ] Codes 30339 et 30190 consolidés
[ ] Statuts A, D et inconnus testés
[ ] Remplacement atomique testé
[ ] Ancien snapshot préservé après échec
[ ] Store en mémoire actualisé sans redémarrage
[ ] Tests association-service verts
[ ] Tests gateway verts
[ ] Essai réel effectué, ou commande de reprise fournie
[ ] Aucun secret ou fichier de données dans Git
```

## 13. Livrables

- code de l’import réel ;
- fixtures Waldec et Import réduites ;
- tests unitaires et d’intégration ;
- configuration Docker et `.env.example` actualisées ;
- README mis à jour ;
- courte synthèse indiquant :
  - les fichiers modifiés ;
  - les choix techniques ;
  - les commandes exécutées ;
  - les limites restantes.

## 14. Règles de contribution

- Utiliser TypeScript strict, modules ES et types explicites aux frontières.
- Respecter l’indentation à deux espaces, les points-virgules et les guillemets
  doubles.
- Écrire les textes utilisateur et les tests en français.
- Placer les tests près du module selon la structure existante.
- Ne pas modifier des changements locaux sans rapport avec cette mission.
- Si un commit est explicitement demandé, utiliser un message Conventional
  Commit en français, par exemple :

```text
feat(associations): importe les sources RNA officielles
```
