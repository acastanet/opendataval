# climate-contracts

Contrats communs du domaine climat OpenDataVal.

Statut : **P4 — draft contractuel**.

Ce répertoire ne contient aucun calcul climatique. Il formalise les échanges entre :

- `apps/copernicus` et les futurs services scientifiques ;
- les quatre services scientifiques et les renderers ;
- les services scientifiques et `climate-commentary-service` ;
- les analyses individuelles et `climate-sheet-service`.

Les schémas utilisent **JSON Schema Draft 2020-12**.

## Arborescence

```text
packages/climate-contracts/
├── README.md
├── schemas/
│   ├── climate-snapshot.schema.json
│   ├── climate-result.schema.json
│   ├── climate-signal.schema.json
│   ├── climate-commentary.schema.json
│   └── climate-sheet.schema.json
└── examples/
    ├── climate-snapshot.example.json
    ├── climate-result.example.json
    ├── climate-signal.example.json
    ├── climate-commentary.example.json
    └── climate-sheet.example.json
```

## Rôle de chaque contrat

### ClimateSnapshot

Manifest immuable des actifs climatiques acquis pour une fiche.

Il conserve notamment :

- la localisation demandée ;
- le dataset et les variables ;
- la période ;
- la représentativité spatiale ;
- les paramètres de récupération ;
- le stockage ;
- l'empreinte SHA-256 ;
- le statut qualité.

Le snapshot ne contient pas de commentaire IA.

### ClimateResult

Enveloppe commune de sortie d'une méthode scientifique.

Le champ `data` reste volontairement extensible : chaque méthode possède ses propres données scientifiques. En revanche, l'enveloppe commune impose :

- `snapshot_id` ;
- `method.id` + `method.version` ;
- localisation demandée et représentée ;
- datasets ;
- représentativité ;
- `signals` ;
- qualité ;
- caveats ;
- provenance.

Le SVG/HTML n'est jamais une source scientifique dans ce contrat.

### ClimateSignal

Interface entre science et interprétation.

Un signal possède obligatoirement :

- un identifiant d'instance `id` ;
- un identifiant sémantique `definition_id` présent dans `doc/climat/signals/catalogue.yaml` ;
- la méthode/version productrice ;
- la métrique ;
- le niveau de preuve ;
- au moins une preuve `evidence.result_pointer`.

Le sens (`higher`, `earlier`, `longer`, etc.) est produit par le service scientifique. Le LLM ne le recalcule pas.

### ClimateCommentary

Sortie structurée de `climate-commentary-service`.

Chaque `finding` doit référencer au moins un `signal_id`. Un commentaire ne peut donc pas produire un constat important sans rattachement à un résultat scientifique.

### ClimateSheet

Manifest de publication de la fiche complète.

Il référence les quatre analyses :

1. `climate_overview` ;
2. `climate_fingerprint` ;
3. `thermal_seasons` ;
4. `water_through_year`.

Chaque analyse peut être `pending`, `ready`, `unavailable` ou `error`.

## Validation en deux niveaux

### 1. JSON Schema

JSON Schema valide la forme :

- champs requis ;
- types ;
- énumérations ;
- structures ;
- présence d'au moins une preuve pour un signal ;
- présence d'au moins un `signal_id` pour un constat IA ;
- contraintes élémentaires de publication.

### 2. Validation applicative

Certaines invariants relient plusieurs documents et ne doivent pas être laissés au LLM.

Le validateur applicatif devra au minimum contrôler :

1. `ClimateResult.provenance.method_id/version == ClimateResult.method` ;
2. `ClimateResult.provenance.snapshot_id == ClimateResult.snapshot_id` ;
3. chaque `ClimateSignal.method == ClimateResult.method` ;
4. chaque `ClimateSignal.definition_id` existe dans `doc/climat/signals/catalogue.yaml` ;
5. la définition du catalogue autorise cette méthode, unité, direction et niveau de preuve ;
6. chaque `evidence.result_pointer` se résout dans le `ClimateResult` et vise une donnée existante ;
7. un `ClimateCommentary.result_ids[]` référence bien les résultats fournis au service ;
8. chaque `finding.signal_ids[]` existe dans ces résultats ;
9. le `claim_level` d'un finding ne dépasse jamais celui des signaux qui le supportent ;
10. un commentaire `valid` ne contient aucun `unsupported_claims` ;
11. les résultats assemblés dans une même fiche utilisent le `snapshot_id` attendu ;
12. une analyse `ready` de `ClimateSheet` possède un `result_ref` effectivement disponible.

## Versionnement

`schema_version` versionne le **contrat d'échange**.

`method.version` versionne la **méthode scientifique**.

Ces deux versions sont indépendantes.

Exemple :

```text
ClimateResult schema_version = 1.0
thermal-seasons method.version = 1.0.0
```

Une modification scientifique peut donc créer `thermal-seasons@1.1.0` sans obliger à changer le schéma commun.

Inversement, une évolution du format commun peut changer `schema_version` sans modifier la méthode scientifique.

## Règles de compatibilité

Pour la V1 :

- ajout d'un champ optionnel : compatible ;
- ajout d'une nouvelle valeur d'énumération : à considérer comme évolution contractuelle ;
- suppression ou renommage d'un champ : incompatible ;
- changement de sens d'un champ existant : incompatible ;
- changement d'une formule scientifique : version de méthode, pas simple changement de schéma.

## Exemples

Les exemples sont des **fixtures contractuelles**, pas des données climatiques de référence.

Ils utilisent des valeurs illustratives uniquement pour vérifier que les contrats s'emboîtent correctement.

Les golden masters scientifiques seront créés en P5 à partir des sorties réelles des POC.

## Relation avec la documentation scientifique

```text
doc/climat/methods/<method>/<version>/
        ↓
calcul scientifique
        ↓
ClimateResult
        ↓
ClimateSignal[]
        ↓
ClimateCommentary
        ↓
ClimateSheet
```

Le registre sémantique des signaux reste :

```text
doc/climat/signals/catalogue.yaml
```

P4 ne remplace ni `method.yaml` ni `interpretation.md` : il rend leurs décisions transportables et validables par les futurs services.
