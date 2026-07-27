# Association Service

Microservice sans base de données qui sert un snapshot compressé des associations RNA de Val-d’Aigoual sous `/api/v2/associations`. Le snapshot est conservé dans le volume persistant, restauré au démarrage et n’est remplacé qu’après une synchronisation complètement valide.

La mission détaillée pour raccorder le service aux extractions RNA nationales
réelles est décrite dans
[`INSTRUCTIONS_IMPORT_RNA.md`](./INSTRUCTIONS_IMPORT_RNA.md).

Les routes publiques passent par le gateway :

- `GET /api/v2/associations?code_insee=30339&q=patrimoine&status=active&category_primary=002000&category_secondary=002055`
- `GET /api/v2/associations/{rnaIdOuIdentifiantHistorique}`
- `GET /api/v2/associations/stats?code_insee=30339`
- `GET /api/v2/associations/map?code_insee=30339`

Les contrôles internes sont `/healthz`, `/readyz`, `/internal/v1/associations/status` et `POST /internal/v1/associations/sync`. Cette dernière route n’est pas publiée par Caddy et peut être protégée avec `ASSOCIATION_SYNC_TOKEN`.

Le filtre intègre `30339` (Val-d’Aigoual/Valleraugue) et `30190` (Notre-Dame-de-la-Rouvière), toujours normalisés vers `30339`. Les adresses et statuts proviennent exclusivement du RNA : un statut actif ne prouve pas une activité locale récente. Les données renvoient systématiquement la provenance et l’état de fraîcheur (`fresh`, `stale`, `expired`).

Les paramètres optionnels `category_primary` et `category_secondary` filtrent
respectivement `objet_social1` et `objet_social2`. Ils acceptent les codes RNA
à six chiffres (par exemple `001000` et `001005`) et les comparent au préfixe
enregistré par l'import. Le paramètre historique `category` reste utilisable
pour une recherche textuelle sur les deux catégories.

## Import

Le service télécharge en flux les deux extractions CSV nationales officielles :

- `RNA_WALDEC_SOURCE_URL` pour les associations disposant d’un numéro RNA ;
- `RNA_IMPORT_SOURCE_URL` pour les associations historiques.

Les deux variables doivent être configurées ensemble. Les fichiers sont lus
ligne par ligne, filtrés sur `30339` et `30190`, adaptés vers le contrat public,
fusionnés puis dédupliqués par identifiants officiels. Aucun fichier national
complet n’est chargé en mémoire.

`RNA_SOURCE_URL` reste accepté uniquement pour la compatibilité avec un ancien
CSV normalisé mono-source.

La commande suivante construit puis remplace atomiquement
`associations-30339.json.gz` :

```bash
pnpm --filter association-service sync
```

Un échec de téléchargement, de schéma ou de validation conserve le snapshot
précédent. La route interne met à jour le store en mémoire sans redémarrage :

```bash
POST /internal/v1/associations/sync
Authorization: Bearer <ASSOCIATION_SYNC_TOKEN>
```

## Vérification

```bash
pnpm check:associations
curl -fsS "http://localhost:8080/api/v2/associations?code_insee=30339"
curl -fsS "http://localhost:8080/api/v2/associations/stats?code_insee=30339"
curl -fsS "http://localhost:8080/api/v2/associations/map?code_insee=30339"
```
