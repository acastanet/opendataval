"""Atelier des scènes : état de chacune, et menu pour les assembler.

Le pipeline se pilote scène par scène, une commande à la fois, avec un chemin de configuration
à recopier. Cela va tant qu'on travaille sur une emprise ; passé quelques-unes, deux choses
échappent :

- **ce qui est à refaire.** Le calage de l'orthophotographie et la position solaire sont *cuits*
  dans la scène au moment de `glb` — le premier dans les coordonnées de texture du GLB, la
  seconde dans `scene.json`. Retoucher un `.conf` ne change donc rien tant que l'assemblage n'a
  pas été rejoué, et rien ne le signalait ;
- **ce qui existe.** Une configuration versionnée peut n'avoir aucune exécution amont, une
  exécution jamais enrichie, ou une scène complète : trois situations qui appellent trois
  actions différentes.

Ce module répond aux deux : `scene_statuses` dresse l'état, `run_menu` le montre et enchaîne.
Il ne réimplémente aucune étape — il appelle les mêmes fonctions que le CLI.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .config import PocConfig


# États possibles d'une scène, du plus complet au plus dépourvu.
READY = "ready"
STALE = "stale"
NEVER_ASSEMBLED = "never"
NO_RUN = "no-run"
UNREADABLE = "unreadable"

STATE_LABELS = {
    READY: "à jour",
    STALE: "configuration plus récente — à réassembler",
    NEVER_ASSEMBLED: "jamais assemblée",
    NO_RUN: "aucune exécution Roofer — voir docs/lidar-roofer.md",
    UNREADABLE: "configuration illisible",
}


@dataclass(frozen=True)
class SceneStatus:
    """Ce qu'une configuration a produit, et ce qui reste à en faire."""

    identifier: str
    source: Path
    title: str
    side_m: float | None
    state: str
    run_dir: Path | None
    assembled_at: datetime | None

    @property
    def label(self) -> str:
        """Intitulé du menu : le titre de la scène, à défaut son identifiant."""
        if self.title and self.side_m:
            return f"{self.title} · {self.side_m:.0f} m"
        return self.title or self.identifier

    @property
    def needs_assembly(self) -> bool:
        return self.state in (STALE, NEVER_ASSEMBLED)

    @property
    def state_label(self) -> str:
        if self.state == READY and self.assembled_at is not None:
            return f"à jour — assemblée le {self.assembled_at:%d/%m/%Y à %Hh%M}"
        return STATE_LABELS[self.state]


def _latest_upstream_run(config: PocConfig) -> Path | None:
    """Dernière exécution Roofer, assemblée ou non."""
    runs = sorted(config.output_dir.glob("run-*"), key=lambda path: path.name)
    return runs[-1] if runs else None


def scene_status(root: Path, source: Path) -> SceneStatus:
    """État d'une configuration, sans jamais lever : une scène cassée doit rester listée."""
    identifier = source.stem
    try:
        config = PocConfig.load(root, source)
        xmin, _, xmax, _ = config.bbox
        title, side = config.scene_title, xmax - xmin
    except (OSError, ValueError):
        return SceneStatus(identifier, source, identifier, None, UNREADABLE, None, None)

    from .web import latest_scene_run

    try:
        assembled = latest_scene_run(config)
        upstream = _latest_upstream_run(config)
    except OSError:
        return SceneStatus(identifier, source, title, side, UNREADABLE, None, None)

    if assembled is None:
        state = NEVER_ASSEMBLED if upstream is not None else NO_RUN
        return SceneStatus(identifier, source, title, side, state, upstream, None)

    scene_glb = assembled / "render" / "scene.glb"
    built = datetime.fromtimestamp(scene_glb.stat().st_mtime)
    # Le `.conf` porte le calage et la position solaire : plus récent que le GLB, il décrit une
    # scène qui n'a pas encore été produite. Une configuration fraîchement extraite d'un dépôt
    # est datée du jour et paraîtra plus récente — l'avertissement invite à réassembler, ce qui
    # est sans risque, et jamais à supprimer quoi que ce soit.
    stale = source.stat().st_mtime > scene_glb.stat().st_mtime
    return SceneStatus(
        identifier,
        source,
        title,
        side,
        STALE if stale else READY,
        assembled,
        built,
    )


def scene_statuses(root: Path) -> list[SceneStatus]:
    """État de toutes les configurations versionnées, dans l'ordre des fichiers."""
    return [scene_status(root, source) for source in sorted((root / "config").glob("*.conf"))]


def stale_scenes(root: Path) -> list[SceneStatus]:
    """Scènes dont la configuration a changé depuis le dernier assemblage."""
    return [status for status in scene_statuses(root) if status.state == STALE]


def warn_if_stale(root: Path, printer=print) -> list[SceneStatus]:
    """Signale les scènes à réassembler. Informe, ne bloque pas."""
    stale = stale_scenes(root)
    if not stale:
        return []
    printer(
        f"AVERTISSEMENT : {len(stale)} scène(s) ont une configuration plus récente que leur "
        "dernier assemblage. Le calage de l'orthophotographie et la position solaire y sont "
        "cuits : relancer `glb` pour que les retouches prennent effet."
    )
    for status in stale:
        # Le chemin est celui qui se recopie tel quel dans un terminal, depuis la racine du POC.
        try:
            source = status.source.relative_to(root).as_posix()
        except ValueError:
            source = status.source.as_posix()
        printer(f"  · {status.label} — poc.py --config {source} glb")
    return stale


# ---------------------------------------------------------------------------------------
# Menu interactif
# ---------------------------------------------------------------------------------------


def _print_table(statuses: list[SceneStatus], printer) -> None:
    printer("")
    printer("  n°  Scène                                      État")
    printer("  " + "─" * 76)
    for index, status in enumerate(statuses, start=1):
        printer(f"  {index:>2}  {status.label:<42} {status.state_label}")
    printer("")


def _ask(prompt: str, reader) -> str | None:
    """Lit une réponse, ou ``None`` si l'entrée est fermée — Ctrl+D, Ctrl+C, tube vide."""
    try:
        return reader(prompt).strip()
    except (EOFError, KeyboardInterrupt):
        return None


def _assemble(root: Path, statuses: list[SceneStatus], config: PocConfig, printer) -> None:
    """Assemble les scènes demandées, puis met le visualiseur à jour une seule fois."""
    from .glb import create_scene_glb
    from .web import prepare_viewer

    done = 0
    for status in statuses:
        printer(f"\n=== {status.label} — assemblage")
        try:
            create_scene_glb(PocConfig.load(root, status.source))
            done += 1
        except (OSError, RuntimeError, ValueError) as error:
            printer(f"ÉCHEC sur {status.label} : {error}")
    if not done:
        return
    # Le manifeste recense toutes les emprises : une seule mise à jour suffit, quel que soit le
    # nombre de scènes assemblées. La configuration courante y reste la scène par défaut.
    printer(f"\n=== Visualiseur — scène par défaut : {config.source.name}")
    prepare_viewer(config)


def _full_pipeline(root: Path, status: SceneStatus, config: PocConfig, printer) -> None:
    """Rejoue le pipeline natif complet, puis rétablit la scène par défaut du visualiseur."""
    from .cli import _enhance
    from .native import check_environment

    printer(f"\n=== {status.label} — pipeline natif complet")
    scene_config = PocConfig.load(root, status.source)
    try:
        run_dir = check_environment(scene_config)
        _enhance(scene_config, run_dir)
    except (OSError, RuntimeError, ValueError) as error:
        printer(f"ÉCHEC sur {status.label} : {error}")
        return
    # `_enhance` termine par le visualiseur, préparé depuis la scène traitée : elle en
    # deviendrait la scène par défaut, celle que le navigateur télécharge au chargement. Le
    # menu hérite du `--config` de la ligne de commande, et c'est lui qui doit trancher.
    if scene_config.source != config.source:
        from .web import prepare_viewer

        printer(f"\n=== Visualiseur — scène par défaut : {config.source.name}")
        prepare_viewer(config)


def _scene_actions(
    root: Path, status: SceneStatus, config: PocConfig, printer, reader
) -> None:
    printer(f"\n{status.label} — {status.state_label}")
    if status.state == NO_RUN:
        printer(
            "  Cette scène n'a aucune exécution Roofer : l'étage Docker est à lancer d'abord.\n"
            "  Voir docs/lidar-roofer.md, puis revenir ici."
        )
        return
    printer("  1. Assembler (glb) et mettre à jour le visualiseur")
    printer("  2. Rejouer tout le pipeline natif (terrain, ortho, végétation, géologie, glb)")
    printer("  3. Retour")
    choice = _ask("  > ", reader)
    if choice == "1":
        _assemble(root, [status], config, printer)
    elif choice == "2":
        _full_pipeline(root, status, config, printer)


def run_menu(config: PocConfig, printer=print, reader=input) -> None:
    """Menu des scènes : montre l'état de chacune et enchaîne les commandes utiles.

    `printer` et `reader` sont injectables pour que le menu reste testable sans terminal.
    """
    root = config.root
    while True:
        statuses = scene_statuses(root)
        if not statuses:
            printer("Aucune configuration dans config/. Créer une scène avec `poc.py scene`.")
            return
        printer("\n=== Scènes du POC 3D ===")
        _print_table(statuses, printer)
        pending = [status for status in statuses if status.needs_assembly]
        printer(f"  a  assembler les {len(pending)} scène(s) à reprendre")
        printer("  s  ouvrir le visualiseur")
        printer("  q  quitter")
        choice = _ask("\nScène (n°) ou action > ", reader)
        if choice is None or choice.lower() in ("q", "quitter"):
            return
        if choice.lower() == "a":
            if pending:
                _assemble(root, pending, config, printer)
            else:
                printer("Rien à reprendre : toutes les scènes sont à jour.")
            continue
        if choice.lower() == "s":
            from .web import serve_viewer

            serve_viewer(config)
            continue
        if choice.isdigit() and 1 <= int(choice) <= len(statuses):
            _scene_actions(root, statuses[int(choice) - 1], config, printer, reader)
            continue
        printer(f"Entrée non reconnue : {choice!r}")
