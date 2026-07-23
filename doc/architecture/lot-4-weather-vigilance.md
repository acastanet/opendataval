# Lot 4 — Weather Vigilance Service

## Chaîne de responsabilité

```text
coordonnées GPS
  → gateway-service
  → geography-service
  → code département
  → weather-vigilance-service
  → gateway-service
  → /api/v2/vigilance
```

Le microservice interne est `weather-vigilance-service`; l'image est `opendataval-vigilance`. Il n'est pas exposé directement par Caddy. La règle Caddy existante `/api/v2/*` suffit et reste dirigée vers le gateway.

## Acquisition

Le collecteur interroge périodiquement les produits officiels `cartevigilance/encours` et `textesvigilance/encours`. Le parser accepte les champs supplémentaires, représente les phénomènes inconnus avec `code: unknown`, et refuse de publier un niveau source non interprétable.

Le snapshot actif n'est remplacé qu'après validation de la carte et validation du produit texte lorsqu'il existe. Le code HTTP 404 du produit texte est traité comme une absence normale de bulletin. Une discordance de `meta.product_datetime` entre carte et textes supprime uniquement les bulletins actifs et produit `BULLETIN_PRODUCT_MISMATCH`.

## Cache

- cache mémoire pour les lectures ;
- volume Docker `vigilance_cache` ;
- snapshot JSON écrit avec fichier temporaire puis renommage atomique ;
- dernier succès, dernière tentative et dernière erreur conservés en mémoire ;
- restauration du snapshot au démarrage.

## Sécurité

Le jeton reste dans l'environnement Docker. Le client limite les tentatives, le temps d'attente, la taille de réponse et le type de contenu. Un circuit breaker s'ouvre après plusieurs échecs consécutifs. Les coordonnées ne sont pas journalisées par le service de vigilance ; le gateway ne journalise pas leur valeur exacte.

## Contrats

Interne :

```http
GET /v1/vigilance/departments/{department_code}
```

Public :

```http
GET /api/v2/vigilance?department_code=30
GET /api/v2/vigilance?lat=44.0812&lon=3.6421&accuracy=25
```

Des coordonnées et un code département incohérents produisent `422 INCONSISTENT_DEPARTMENT`.

## Limites connues

Le MVP couvre les départements métropolitains, dont `2A` et `2B`. Les zones littorales et massifs avalancheux sont conservés uniquement lorsqu'ils sont rattachés au produit départemental ; aucune API locale plus fine n'est créée. Le phénomène crues ne fournit pas de chronologie propre lorsqu'elle est absente du flux officiel.
