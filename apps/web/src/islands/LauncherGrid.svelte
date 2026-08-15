<script lang="ts">
  import QRCode from "qrcode";
  import Fa from "svelte-fa";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import {
    faArrowUpRightFromSquare,
    faBoxArchive,
    faBookOpen,
    faBuildingColumns,
    faBus,
    faChartColumn,
    faChartLine,
    faCheckToSlot,
    faCircleInfo,
    faCloudBolt,
    faCloudSun,
    faCloudSunRain,
    faCoins,
    faCubes,
    faDatabase,
    faDrawPolygon,
    faFireFlameCurved,
    faGaugeHigh,
    faGlobe,
    faHandshakeAngle,
    faHelmetSafety,
    faLeaf,
    faMapLocationDot,
    faMountain,
    faMountainSun,
    faNetworkWired,
    faPersonHiking,
    faQrcode,
    faSatelliteDish,
    faServer,
    faStore,
    faTemperatureHalf,
    faTree,
    faTriangleExclamation,
    faTruckFast,
    faUsers,
    faWater,
  } from "@fortawesome/free-solid-svg-icons";

  export type CellCategory = "app" | "theme" | "tech";

  export interface Cell {
    id: string;
    label: string;
    name: string;
    description: string;
    href: string;
    icon: string;
    color: string;
    textColor?: string;
    /** Teinte du pictogramme au recto, si la couleur de la tuile manque de contraste sur blanc. */
    iconColor?: string;
    category: CellCategory;
  }

  export let cells: Cell[] = [];

  /** Une icône propre à chaque tuile : les clés viennent du champ `icon` d'index.astro. */
  const ICONS: Record<string, IconDefinition> = {
    // Applications
    fire: faFireFlameCurved,
    "fire-live": faSatelliteDish,
    vigilance: faTriangleExclamation,
    water: faWater,
    "water-dashboard": faChartLine,
    map: faMapLocationDot,
    relief: faMountainSun,
    cube: faCubes,
    meteo: faCloudSunRain,
    "meteo-essentiel": faCloudSun,
    thermique: faTemperatureHalf,
    comparaison: faChartColumn,
    infos: faCircleInfo,
    "meteo-v2": faCloudBolt,
    old: faTree,
    truck: faTruckFast,
    terrain: faHelmetSafety,
    // Thèmes de données (clé = `theme-${slug}`)
    // Contours administratifs : distingue « le territoire » du fronton des services publics.
    "theme-territoire": faDrawPolygon,
    "theme-population": faUsers,
    "theme-economie": faStore,
    "theme-finances": faCoins,
    "theme-geographie": faMountain,
    "theme-meteo": faCloudSun,
    "theme-environnement": faLeaf,
    "theme-risques": faTriangleExclamation,
    "theme-services": faBuildingColumns,
    "theme-tourisme": faPersonHiking,
    "theme-mobilite": faBus,
    "theme-democratie": faCheckToSlot,
    "theme-sources": faDatabase,
    // Services techniques
    server: faServer,
    gauge: faGaugeHigh,
    gateway: faNetworkWired,
    globe: faGlobe,
    associations: faHandshakeAngle,
    legacy: faBoxArchive,
  };
  const ICON_DEFAULT = faBookOpen;

  let tooltip: { visible: boolean; cell: Cell | null; x: number; y: number } = {
    visible: false,
    cell: null,
    x: 0,
    y: 0,
  };
  function showTooltip(cell: Cell) {
    tooltip = { ...tooltip, visible: true, cell };
  }
  function hideTooltip() {
    tooltip = { ...tooltip, visible: false };
  }
  function trackCursor(event: MouseEvent) {
    if (!tooltip.visible) return;
    // Bascule l'infobulle du côté opposé quand elle sortirait de l'écran.
    const largeur = 320;
    const hauteur = 130;
    const x = event.clientX + largeur + 30 > window.innerWidth ? event.clientX - largeur - 20 : event.clientX + 20;
    const y = event.clientY + hauteur + 45 > window.innerHeight ? event.clientY - hauteur - 15 : event.clientY + 35;
    tooltip = { ...tooltip, x, y };
  }

  function isMobileViewport() {
    return typeof window !== "undefined" && window.innerWidth <= 768;
  }

  let sheetCell: Cell | null = null;
  function openSheet(cell: Cell) {
    sheetCell = cell;
  }
  function closeSheet() {
    sheetCell = null;
  }

  let qr: { open: boolean; title: string; url: string; dataUrl: string } = {
    open: false,
    title: "",
    url: "",
    dataUrl: "",
  };
  async function openQr(cell: Cell) {
    const url = new URL(cell.href, window.location.origin).href;
    qr = { open: true, title: cell.name, url, dataUrl: "" };
    qr.dataUrl = await QRCode.toDataURL(url, {
      margin: 1,
      width: 300,
      color: { dark: "#18302a", light: "#ffffff" },
    });
  }
  function closeQr() {
    qr = { ...qr, open: false };
  }

  function handleCellClick(event: MouseEvent, cell: Cell) {
    if (isMobileViewport()) {
      event.preventDefault();
      openSheet(cell);
    }
  }
</script>

<svelte:window on:mousemove={trackCursor} />

<div class="launcher-grid">
  <div class="grid">
    {#each cells as cell (cell.id)}
      <a
        class="cell cell-{cell.category}"
        href={cell.href}
        aria-label="{cell.name} — {cell.description}"
        style="--cell-color:{cell.color}; --text-color:{cell.textColor ?? '#fff'}; --icon-color:{cell.iconColor ?? cell.color};"
        on:mouseenter={() => showTooltip(cell)}
        on:mouseleave={hideTooltip}
        on:click={(event) => handleCellClick(event, cell)}
      >
        <span class="cell-front">
          <span class="cell-icone" aria-hidden="true"><Fa icon={ICONS[cell.icon] ?? ICON_DEFAULT} /></span>
        </span>
        <span class="cell-back">
          <span class="cell-label">{cell.label}</span>
          <span class="cell-nom">{cell.name}</span>
          <span class="back-actions">
            <button
              class="action-btn"
              type="button"
              title="Ouvrir dans un nouvel onglet"
              on:click|preventDefault|stopPropagation={() => window.open(cell.href, "_blank", "noopener")}
            >
              <Fa icon={faArrowUpRightFromSquare} />
            </button>
            <button
              class="action-btn"
              type="button"
              title="Afficher le QR code"
              on:click|preventDefault|stopPropagation={() => openQr(cell)}
            >
              <Fa icon={faQrcode} />
            </button>
          </span>
        </span>
      </a>
    {/each}
  </div>
</div>

<div class="cursor-tooltip" class:visible={tooltip.visible} style="left:{tooltip.x}px; top:{tooltip.y}px;">
  {#if tooltip.cell}
    <strong class="tooltip-titre">{tooltip.cell.name}</strong>
    <span class="tooltip-description">{tooltip.cell.description}</span>
    <span class="tooltip-url">{tooltip.cell.href}</span>
  {/if}
</div>

{#if qr.open}
  <div class="qr-modal open" on:click={(e) => e.target === e.currentTarget && closeQr()}>
    <div class="qr-card">
      <button class="qr-close" type="button" on:click={closeQr} aria-label="Fermer">×</button>
      {#if qr.dataUrl}
        <img src={qr.dataUrl} alt={`QR code vers ${qr.title}`} width="300" height="300" />
      {/if}
      <p class="qr-title">{qr.title}</p>
      <p class="qr-url">{qr.url}</p>
    </div>
  </div>
{/if}

{#if sheetCell}
  <div class="mobile-bar open" on:click={(e) => e.target === e.currentTarget && closeSheet()}>
    <div class="mobile-sheet">
      <h3>{sheetCell.name}</h3>
      <p class="mobile-description">{sheetCell.description}</p>
      <button
        class="mobile-btn primary"
        type="button"
        on:click={() => {
          if (sheetCell) window.location.href = sheetCell.href;
        }}
      >
        Ouvrir
      </button>
      <button
        class="mobile-btn"
        type="button"
        on:click={() => {
          if (sheetCell) openQr(sheetCell);
          closeSheet();
        }}
      >
        Afficher le QR code
      </button>
      <button class="mobile-btn plain" type="button" on:click={closeSheet}>Fermer</button>
    </div>
  </div>
{/if}

<style>
  /* L'infobulle, la modale QR et le panneau mobile sont rendus hors de
     .launcher-grid : les variables de couleur doivent être déclarées sur
     chacune de ces racines, sinon leurs var() restent invalides. */
  .launcher-grid,
  .cursor-tooltip,
  .qr-modal,
  .mobile-bar {
    --paper-white: #ffffff;
    --paper-black: #18302a;
  }

  .launcher-grid {
    --s: 108px;
    --g: 14px;
    --shadow-paper-flat: 2px 2px 0 rgba(24, 48, 42, 0.08), 0 4px 12px rgba(24, 48, 42, 0.05);
    position: relative;
    isolation: isolate;
  }

  .launcher-grid::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.035;
    z-index: 1;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    mix-blend-mode: multiply;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--s), 1fr));
    gap: var(--g);
    /* Profondeur commune à toutes les tuiles : la rotation se voit en perspective. */
    perspective: 1400px;
  }

  .cell {
    position: relative;
    aspect-ratio: 1 / 1;
    display: block;
    text-decoration: none;
    color: inherit;
    -webkit-tap-highlight-color: transparent;
    transform-style: preserve-3d;
    transition: transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Aucun `filter` sur .cell : un filtre sur un parent preserve-3d aplatit le
     contexte 3D et supprime la rotation. Les effets restent sur les faces. */
  .cell:hover,
  .cell:focus-within {
    transform: rotateY(180deg);
    z-index: 3;
    will-change: transform;
  }

  .cell-back,
  .cell-front {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .cell-front {
    background: var(--paper-white);
    border: 1px solid rgba(24, 48, 42, 0.08);
    box-shadow: var(--ombre-courte-paper-flat);
  }

  .cell-icone {
    font-size: calc(var(--s) * 0.36);
    line-height: 1;
    /* Le pictogramme porte la couleur de sa famille : la légende du hero
       (applications / thèmes / services) devient lisible dès le repos. */
    color: var(--icon-color, var(--cell-color));
    display: flex;
  }

  .cell-back {
    background: var(--cell-color, #168aad);
    overflow: hidden;
    box-shadow: 4px 4px 0 rgba(24, 48, 42, 0.14);
    transform: rotateY(180deg);
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    text-align: center;
  }

  .cell-label {
    font-size: 1.45rem;
    font-weight: 700;
    line-height: 1;
    color: var(--texte-principal-color, #fff);
  }

  .cell-nom {
    font-size: 0.55rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--texte-principal-color, #fff);
    opacity: 0.85;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .back-actions {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }

  .action-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 0.65rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .action-btn:hover,
  .action-btn:focus-visible {
    background: rgba(255, 255, 255, 0.4);
  }

  .cursor-tooltip {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-width: 320px;
    background: var(--surface-plate, #fff);
    color: var(--texte-principal, #18302a);
    border: 1px solid var(--paper-black);
    padding: 0.55rem 0.8rem;
    font-size: 0.8rem;
    border-radius: 3px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 140ms ease;
    z-index: 1000;
    box-shadow: 4px 4px 0 rgba(24, 48, 42, 0.12);
  }

  .cursor-tooltip.visible {
    opacity: 1;
  }

  .tooltip-titre {
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .tooltip-description {
    font-size: 0.78rem;
    font-weight: 400;
    line-height: 1.45;
    color: var(--texte-secondaire, #566);
  }

  .tooltip-url {
    font-family: var(--font-mono, monospace);
    font-size: 0.68rem;
    color: var(--couleur-action, #087f5b);
    word-break: break-all;
  }

  .qr-modal {
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: rgba(24, 48, 42, 0.3);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qr-card {
    background: var(--paper-white);
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    box-shadow: 8px 8px 0 rgba(24, 48, 42, 0.14), 0 30px 60px rgba(24, 48, 42, 0.25);
    position: relative;
    width: min(80vw, 320px);
    border-radius: 6px;
  }

  .qr-card img {
    width: 100%;
    height: auto;
    border: 1px solid #eee;
    border-radius: 3px;
  }

  .qr-title {
    margin: 0;
    font-weight: 700;
    color: var(--paper-black);
    text-align: center;
  }

  .qr-url {
    font-size: 0.8rem;
    color: #666;
    word-break: break-all;
    text-align: center;
    margin: 0;
  }

  .qr-close {
    position: absolute;
    top: 8px;
    right: 12px;
    background: none;
    border: none;
    font-size: 1.6rem;
    cursor: pointer;
    color: var(--paper-black);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  .qr-close:hover {
    background: #f2f7f3;
  }

  .mobile-bar {
    position: fixed;
    inset: 0;
    z-index: 2000;
    background: rgba(24, 48, 42, 0.4);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .mobile-sheet {
    background: var(--paper-white);
    width: 100%;
    max-width: 500px;
    padding: 24px 20px;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mobile-sheet h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--paper-black);
  }

  .mobile-description {
    margin: 0 0 4px;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--texte-secondaire, #566);
  }

  .mobile-btn {
    padding: 16px;
    border: 1px solid var(--paper-black);
    font-weight: 600;
    cursor: pointer;
    background: var(--paper-white);
    color: var(--paper-black);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 3px;
  }

  .mobile-btn.primary {
    background: var(--paper-black);
    color: var(--paper-white);
  }

  .mobile-btn.plain {
    border: none;
  }

  @media (max-width: 768px) {
    .launcher-grid {
      --s: 84px;
      --g: 10px;
    }
    .cell-nom {
      display: none;
    }
  }

  @media (max-width: 500px) {
    .launcher-grid {
      --s: 72px;
      --g: 8px;
    }
    .back-actions {
      display: none;
    }
  }

  /* Sans animation : le verso se substitue au recto par fondu, sans rotation. */
  @media (prefers-reduced-motion: reduce) {
    .cell {
      transition: none;
    }
    .cell:hover,
    .cell:focus-within {
      transform: none;
    }
    .cell-back {
      transform: none;
      backface-visibility: visible;
      -webkit-backface-visibility: visible;
      opacity: 0;
      transition: opacity 120ms ease;
      z-index: 2;
    }
    .cell:hover .cell-back,
    .cell:focus-within .cell-back {
      opacity: 1;
    }
  }
</style>
