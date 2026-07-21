# Aide pour agent de codage — Intégration de l’API Copernicus CDS

## Objectif

Intégrer l’API du **Copernicus Climate Data Store — CDS** dans l’application afin de télécharger et d’exploiter des données climatiques.

L’intégration doit utiliser le client Python officiel `cdsapi`.

L’API pourra notamment servir à récupérer des données permettant de produire un bilan climatique mensuel pour une commune.

---

## Règles de sécurité

La clé API Copernicus est un secret.

url: https://cds.climate.copernicus.eu/api
key: VOTRE_CLE_API_COPERNICUS


Elle ne doit jamais être :

* écrite directement dans le code source ;
* envoyée au navigateur ;
* enregistrée dans Git ;
* publiée dans un fichier README ;
* affichée dans les journaux de l’application ;
* intégrée dans une image Docker publique.

La clé doit être stockée uniquement :

* dans le fichier personnel `.cdsapirc` en développement ;
* dans une variable secrète ou un gestionnaire de secrets en production.

Ajouter les fichiers suivants au `.gitignore` :

```gitignore
.cdsapirc
.env
*.grib
*.grib2
*.nc
data/downloads/
```

---

# 1. Installer le client CDS

L’environnement doit utiliser Python 3.

Installer une version récente de `cdsapi` :

```bash
python -m pip install --upgrade "cdsapi>=0.7.7"
```

Ajouter également la dépendance au fichier `requirements.txt` :

```text
cdsapi>=0.7.7
```

---

# 2. Configurer l’authentification

## Configuration standard sous Linux

Créer le fichier :

```text
$HOME/.cdsapirc
```

Contenu attendu :

```yaml
url: https://cds.climate.copernicus.eu/api
key: VOTRE_CLE_API_COPERNICUS
```

Créer le fichier avec des permissions restrictives :

```bash
touch "$HOME/.cdsapirc"
chmod 600 "$HOME/.cdsapirc"
```

Ne jamais produire automatiquement ce fichier avec une clé écrite dans le dépôt.

---

## Configuration sous Windows

Le fichier doit être placé dans le dossier personnel de l’utilisateur :

```text
C:\Users\NOM_UTILISATEUR\.cdsapirc
```

Il peut être ouvert depuis PowerShell avec :

```powershell
notepad $HOME\.cdsapirc
```

Son contenu est identique :

```yaml
url: https://cds.climate.copernicus.eu/api
key: VOTRE_CLE_API_COPERNICUS
```

---

# 3. Vérifier la configuration

Créer un fichier temporaire `test_cds.py` :

```python
from __future__ import annotations

import cdsapi


def main() -> None:
    try:
        client = cdsapi.Client()
        print("Configuration CDS détectée.")
        print("Le client Copernicus a été initialisé.")
    except Exception as exc:
        raise RuntimeError(
            "Impossible d'initialiser le client CDS. "
            "Vérifier le fichier ~/.cdsapirc et la version de cdsapi."
        ) from exc


if __name__ == "__main__":
    main()
```

Exécuter :

```bash
python test_cds.py
```

Cette vérification confirme que le fichier de configuration est détecté. Elle ne garantit pas encore qu’un jeu de données précis peut être téléchargé.

---

# 4. Accepter les conditions d’utilisation

Avant tout téléchargement, l’utilisateur doit ouvrir manuellement la page du jeu de données dans le Climate Data Store.

Il doit ensuite :

1. se connecter à son compte Copernicus ;
2. ouvrir l’onglet de téléchargement du jeu de données ;
3. accepter les conditions d’utilisation affichées en bas du formulaire ;
4. construire une première sélection ;
5. utiliser le bouton **Show API request code**.

L’acceptation des conditions ne peut pas être automatisée par l’application.

Une erreur d’autorisation peut apparaître lorsque les conditions du jeu de données n’ont pas encore été acceptées.

---

# 5. Ne pas inventer les paramètres de requête

Les paramètres diffèrent selon les jeux de données.

L’agent de codage ne doit pas deviner :

* le nom court du jeu de données ;
* les noms des variables ;
* les formats disponibles ;
* la structure des dates ;
* les niveaux atmosphériques ;
* les statistiques proposées ;
* les valeurs autorisées.

La requête initiale doit être copiée depuis le bouton :

```text
Show API request code
```

sur la page officielle du jeu de données.

Structure générale :

```python
import cdsapi

client = cdsapi.Client()

dataset = "<DATASET-SHORT-NAME>"

request = {
    # Paramètres générés par le formulaire CDS
}

target = "data/downloads/resultat.nc"

client.retrieve(dataset, request, target)
```

---

# 6. Créer un client réutilisable

Créer le fichier :

```text
src/copernicus/client.py
```

Contenu proposé :

```python
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import cdsapi

logger = logging.getLogger(__name__)


class CopernicusDownloadError(RuntimeError):
    """Erreur levée lorsqu'un téléchargement Copernicus échoue."""


class CopernicusClient:
    def __init__(self) -> None:
        try:
            self._client = cdsapi.Client()
        except Exception as exc:
            raise CopernicusDownloadError(
                "Impossible d'initialiser le client Copernicus CDS. "
                "Vérifier la configuration de la clé API."
            ) from exc

    def download(
        self,
        dataset: str,
        request: dict[str, Any],
        target: str | Path,
    ) -> Path:
        target_path = Path(target)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        if target_path.exists() and target_path.stat().st_size > 0:
            logger.info(
                "Le fichier Copernicus existe déjà : %s",
                target_path,
            )
            return target_path

        logger.info(
            "Début du téléchargement du jeu de données %s",
            dataset,
        )

        try:
            self._client.retrieve(
                dataset,
                request,
                str(target_path),
            )
        except Exception as exc:
            if target_path.exists():
                target_path.unlink(missing_ok=True)

            raise CopernicusDownloadError(
                f"Échec du téléchargement du jeu de données '{dataset}'. "
                "Vérifier les paramètres, les conditions d'utilisation "
                "et l'état du service CDS."
            ) from exc

        if not target_path.exists() or target_path.stat().st_size == 0:
            raise CopernicusDownloadError(
                "Le téléchargement s'est terminé sans produire "
                "un fichier exploitable."
            )

        logger.info(
            "Téléchargement terminé : %s",
            target_path,
        )

        return target_path
```

---

# 7. Créer une requête distincte du client

La définition de la requête ne doit pas être mélangée au code d’authentification.

Créer par exemple :

```text
src/copernicus/requests/monthly_thermal.py
```

```python
from __future__ import annotations

from typing import Any


DATASET_NAME = "<NOM_COURT_COPIE_DEPUIS_LE_CDS>"


def build_monthly_request(
    *,
    year: int,
    month: int,
    latitude: float,
    longitude: float,
) -> dict[str, Any]:
    """
    Construit une requête mensuelle pour un point géographique.

    Les paramètres réels doivent être remplacés par ceux générés
    sur la page officielle du jeu de données CDS.
    """

    if not 1940 <= year <= 2100:
        raise ValueError("Année invalide.")

    if not 1 <= month <= 12:
        raise ValueError("Le mois doit être compris entre 1 et 12.")

    if not -90 <= latitude <= 90:
        raise ValueError("Latitude invalide.")

    if not -180 <= longitude <= 180:
        raise ValueError("Longitude invalide.")

    return {
        # Reprendre exactement les propriétés générées par le CDS.
        #
        # Exemple de structure uniquement :
        #
        # "variable": ["..."],
        # "year": [str(year)],
        # "month": [f"{month:02d}"],
        # "location": {
        #     "latitude": latitude,
        #     "longitude": longitude,
        # },
        # "data_format": "netcdf",
    }
```

Ne pas considérer les propriétés commentées ci-dessus comme des paramètres réels. Elles doivent être remplacées par la requête officielle générée pour le jeu de données sélectionné.

---

# 8. Exemple d’utilisation

Créer un script :

```text
scripts/download_monthly_climate.py
```

```python
from __future__ import annotations

from pathlib import Path

from src.copernicus.client import CopernicusClient
from src.copernicus.requests.monthly_thermal import (
    DATASET_NAME,
    build_monthly_request,
)


def main() -> None:
    request = build_monthly_request(
        year=2026,
        month=6,
        latitude=43.9,
        longitude=3.6,
    )

    client = CopernicusClient()

    output = client.download(
        dataset=DATASET_NAME,
        request=request,
        target=Path(
            "data/downloads/"
            "thermal_2026_06_43.9_3.6.nc"
        ),
    )

    print(f"Fichier disponible : {output}")


if __name__ == "__main__":
    main()
```

Les coordonnées ci-dessus sont des exemples. L’application doit utiliser les coordonnées représentatives de la commune ou de la zone étudiée.

---

# 9. Architecture recommandée pour une application web

Le navigateur ne doit jamais appeler directement Copernicus avec la clé CDS.

Architecture attendue :

```text
Navigateur
    ↓
Backend de l’application
    ↓
File d’attente ou tâche de téléchargement
    ↓
API Copernicus CDS
    ↓
Stockage local ou objet
    ↓
Traitement et agrégation
    ↓
Réponse simplifiée au navigateur
```

Le backend doit :

* conserver la clé ;
* construire les requêtes ;
* télécharger les fichiers ;
* mettre les résultats en cache ;
* analyser les fichiers NetCDF ou GRIB ;
* produire des indicateurs simplifiés ;
* transmettre uniquement les résultats utiles au frontend.

Le frontend ne doit recevoir ni la clé, ni le fichier `.cdsapirc`.

---

# 10. Ne pas télécharger les données à chaque consultation

Les requêtes Copernicus peuvent être longues et sont traitées comme des tâches serveur.

Pour un bilan mensuel communal :

1. exécuter une récupération après la fin du mois ;
2. stocker le fichier source ;
3. calculer les indicateurs une seule fois ;
4. enregistrer les résultats agrégés dans la base ;
5. servir ces résultats depuis le cache ou la base de données.

Exemple de clé de cache :

```text
copernicus:thermal:
commune-30123:
2026-06:
dataset-version
```

Une consultation d’un habitant ne doit pas déclencher un nouveau téléchargement CDS.

---

# 11. Gestion des zones communales

Une seule coordonnée peut être insuffisante pour une commune :

* très étendue ;
* montagneuse ;
* située entre plusieurs vallées ;
* présentant de fortes différences d’altitude ;
* située près du littoral ;
* couverte par plusieurs mailles climatiques.

Prévoir deux modes.

## Mode simple

Utiliser un point représentatif :

* centre géographique ;
* mairie ;
* station météorologique de référence ;
* principal secteur habité.

## Mode territorial

Utiliser plusieurs points ou une emprise géographique, puis calculer :

* la moyenne communale ;
* la valeur minimale ;
* la valeur maximale ;
* la part du territoire dépassant un seuil ;
* les différences entre secteurs ou altitudes.

Le bilan doit indiquer clairement si les données représentent :

```text
un point de référence
```

ou :

```text
une estimation sur l’ensemble du territoire communal
```

---

# 12. Formats de fichiers

Les jeux de données Copernicus sont fréquemment proposés en :

* NetCDF ;
* GRIB ;
* ZIP ;
* CSV pour certains produits.

Pour une application d’analyse climatique, privilégier NetCDF lorsque ce format est disponible.

Dépendances Python possibles :

```bash
python -m pip install xarray netCDF4 pandas
```

Dans `requirements.txt` :

```text
xarray
netCDF4
pandas
```

Exemple d’ouverture d’un fichier NetCDF :

```python
from pathlib import Path

import xarray as xr


def inspect_netcdf(path: str | Path) -> None:
    dataset = xr.open_dataset(path)

    try:
        print(dataset)
        print(dataset.data_vars)
        print(dataset.coords)
    finally:
        dataset.close()
```

Ne pas écrire le traitement final avant d’avoir inspecté les noms réels des variables et des dimensions du fichier téléchargé.

---

# 13. Indicateurs possibles pour un bilan mensuel

Lorsque les variables nécessaires sont disponibles, le traitement peut produire :

* la valeur thermique ressentie moyenne ;
* la valeur maximale du mois ;
* la valeur minimale du mois ;
* le nombre de journées avec stress thermique ;
* le nombre de journées dépassant un seuil ;
* le nombre de nuits très chaudes ;
* l’écart par rapport à la normale climatique ;
* la position du mois dans l’historique ;
* la durée du principal épisode chaud ou froid.

Ne pas mélanger sans explication :

* température de l’air ;
* température ressentie ;
* indice UTCI ;
* anomalie climatique ;
* fréquence de dépassement d’un seuil.

Chaque indicateur affiché doit comporter :

```text
Nom
Valeur
Unité
Période
Source
Méthode de calcul
Période de référence
Limite d’interprétation
```

---

# 14. Gestion des erreurs

Prévoir des messages distincts pour les situations suivantes :

## Configuration absente

```text
La configuration Copernicus est absente.
Vérifiez le fichier .cdsapirc ou le secret du serveur.
```

## Clé refusée

```text
L’authentification auprès du Climate Data Store a échoué.
La clé a peut-être expiré ou été révoquée.
```

## Conditions non acceptées

```text
Les conditions d’utilisation de ce jeu de données
doivent être acceptées manuellement dans le CDS.
```

## Requête incorrecte

```text
La requête n’est pas compatible avec le jeu de données.
Régénérez le code depuis le formulaire officiel CDS.
```

## Service indisponible

```text
Le service Copernicus est momentanément indisponible.
Le dernier bilan déjà calculé reste accessible.
```

## Téléchargement incomplet

```text
Le fichier reçu est vide ou incomplet.
La tâche devra être relancée.
```

Ne jamais afficher la clé ou le contenu du fichier `.cdsapirc` dans les erreurs.

---

# 15. Journalisation

Les journaux peuvent contenir :

* le nom du jeu de données ;
* le mois demandé ;
* l’année demandée ;
* la zone géographique ;
* la date de lancement ;
* le statut de la requête ;
* le chemin du fichier produit ;
* la durée de traitement ;
* le message d’erreur nettoyé.

Les journaux ne doivent pas contenir :

* la clé CDS ;
* le fichier `.cdsapirc` ;
* des en-têtes d’authentification ;
* des URL contenant un secret ;
* les variables d’environnement secrètes.

---

# 16. Tests à prévoir

## Test de validation des coordonnées

```python
import pytest

from src.copernicus.requests.monthly_thermal import (
    build_monthly_request,
)


def test_rejects_invalid_latitude() -> None:
    with pytest.raises(ValueError):
        build_monthly_request(
            year=2026,
            month=6,
            latitude=120,
            longitude=3.6,
        )


def test_rejects_invalid_month() -> None:
    with pytest.raises(ValueError):
        build_monthly_request(
            year=2026,
            month=13,
            latitude=43.9,
            longitude=3.6,
        )
```

## Test du cache

Le système doit vérifier qu’un fichier déjà téléchargé n’est pas téléchargé une seconde fois.

## Test sans clé

Le projet doit produire un message d’erreur compréhensible lorsque la configuration CDS est absente.

## Test de fichier incomplet

Un fichier vide ne doit jamais être considéré comme un téléchargement réussi.

---

# 17. Tâche planifiée mensuelle

Pour produire le bilan du mois précédent, exécuter une tâche quelques jours après le début du nouveau mois.

Exemple de logique :

```python
from datetime import date


def previous_month(reference: date) -> tuple[int, int]:
    if reference.month == 1:
        return reference.year - 1, 12

    return reference.year, reference.month - 1
```

Le décalage permet aux données récentes d’être disponibles et évite de produire un bilan incomplet immédiatement après le dernier jour du mois.

La tâche doit être relançable sans créer de doublons.

---

# 18. Résultat attendu de l’agent de codage

L’agent doit livrer :

1. une dépendance `cdsapi>=0.7.7` ;
2. un client CDS centralisé ;
3. une configuration ne contenant aucun secret dans Git ;
4. une requête copiée depuis le générateur officiel du jeu de données ;
5. un script de téléchargement reproductible ;
6. un stockage local ou objet des fichiers sources ;
7. un système de cache ;
8. une gestion explicite des erreurs ;
9. des tests unitaires minimaux ;
10. une documentation d’installation ;
11. une procédure d’acceptation manuelle des conditions ;
12. un traitement séparé pour convertir les données brutes en indicateurs communaux.

---

# 19. Points à ne pas faire

Ne pas :

* utiliser la clé copiée dans la présente documentation ;
* écrire la clé dans Python ;
* appeler Copernicus depuis JavaScript côté navigateur ;
* déclencher un téléchargement à chaque visite ;
* inventer les paramètres du jeu de données ;
* supposer que toutes les communes sont représentées correctement par un seul point ;
* afficher une donnée maillée comme une mesure précise à l’échelle d’une rue ;
* confondre le stress thermique avec la seule température de l’air ;
* supprimer les fichiers sources avant d’avoir validé le traitement ;
* masquer les incertitudes ou les limites géographiques.

---

# 20. Première étape opérationnelle

Avant de développer le traitement climatique :

1. choisir le jeu de données dans le CDS ;
2. accepter ses conditions ;
3. sélectionner manuellement un mois et une localisation ;
4. cliquer sur **Show API request code** ;
5. copier le nom du jeu de données et la requête générée ;
6. effectuer un téléchargement de test ;
7. inspecter le fichier obtenu ;
8. seulement ensuite développer les calculs du bilan mensuel.
