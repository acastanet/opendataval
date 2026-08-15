<script>
  import { echelleLineaire, ticks, cheminLigne } from "../../lib/graphe";

  /** [{ mois: 1..12, tm, tn, tx, rr }] — sortie de /api/meteo/climat/normales. */
  export let mois = [];
  export let hauteur = 280;

  const LARGEUR = 720;
  const MARGE = { haut: 16, droite: 40, bas: 28, gauche: 40 };
  const NOMS_MOIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  $: largeurTrace = LARGEUR - MARGE.gauche - MARGE.droite;
  $: hauteurTrace = hauteur - MARGE.haut - MARGE.bas;

  $: donnees = [...mois]
    .sort((a, b) => a.mois - b.mois)
    .map((m) => ({
      mois: m.mois,
      tm: m.tm === null || m.tm === undefined ? null : Number(m.tm),
      tn: m.tn === null || m.tn === undefined ? null : Number(m.tn),
      tx: m.tx === null || m.tx === undefined ? null : Number(m.tx),
      rr: m.rr === null || m.rr === undefined ? null : Number(m.rr),
    }));

  $: temperatures = donnees.flatMap((d) => [d.tm, d.tn, d.tx]).filter((v) => v !== null);
  $: tMin = temperatures.length ? Math.min(...temperatures, 0) : 0;
  $: tMax = temperatures.length ? Math.max(...temperatures) : 1;
  $: margeT = (tMax - tMin) * 0.1 || 1;

  $: precipitations = donnees.map((d) => d.rr).filter((v) => v !== null);
  $: rrMax = precipitations.length ? Math.max(...precipitations) * 1.15 : 1;

  $: echelleXCat = (i) => MARGE.gauche + (i + 0.5) * (largeurTrace / 12);
  $: pasCat = largeurTrace / 12;
  $: echelleT = echelleLineaire([tMin - margeT, tMax + margeT], [MARGE.haut + hauteurTrace, MARGE.haut]);
  $: echelleRR = echelleLineaire([0, rrMax], [MARGE.haut + hauteurTrace, MARGE.haut]);

  $: ticksT = ticks(tMin - margeT, tMax + margeT, 5);
  $: ticksRR = ticks(0, rrMax, 4);

  $: cheminTm = cheminLigne(
    donnees.map((d, i) => ({ x: echelleXCat(i), y: d.tm === null ? null : echelleT(d.tm) })),
  );

  $: bandeTnTx = (() => {
    if (donnees.some((d) => d.tn === null || d.tx === null)) return "";
    const haut = donnees.map((d, i) => ({ x: echelleXCat(i), y: echelleT(d.tx) }));
    const bas = donnees.map((d, i) => ({ x: echelleXCat(i), y: echelleT(d.tn) }));
    const aller = haut.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const retour = [...bas]
      .reverse()
      .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    return `${aller} ${retour} Z`;
  })();

  $: largeurBarre = pasCat * 0.5;
</script>

<svg viewBox={`0 0 ${LARGEUR} ${hauteur}`} role="img" aria-label="Diagramme climatique mensuel" class="diagramme">
  {#each ticksT as t}
    <line x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={echelleT(t)} y2={echelleT(t)} class="grille" />
    <text x={MARGE.gauche - 6} y={echelleT(t)} class="label-y label-gauche">{t}°</text>
  {/each}
  {#each ticksRR as t}
    <text x={LARGEUR - MARGE.droite + 6} y={echelleRR(t)} class="label-y label-droite">{t}</text>
  {/each}
  {#each donnees as d, i}
    {#if d.rr !== null}
      <rect
        x={echelleXCat(i) - largeurBarre / 2}
        y={echelleRR(d.rr)}
        width={largeurBarre}
        height={echelleRR(0) - echelleRR(d.rr)}
        fill="var(--torrent)"
        opacity="0.55"
      />
    {/if}
    <text x={echelleXCat(i)} y={hauteur - 8} class="label-x">{NOMS_MOIS[d.mois - 1]}</text>
  {/each}
  {#if bandeTnTx}
    <path d={bandeTnTx} fill="var(--alerte)" opacity="0.15" />
  {/if}
  <path d={cheminTm} fill="none" stroke="var(--alerte)" stroke-width="2" />
</svg>

<p class="legende">
  <span><span class="puce" style="background:var(--alerte)"></span>Température moyenne (bande = mini/maxi)</span>
  <span><span class="puce" style="background:var(--torrent)"></span>Précipitations (mm, axe droit)</span>
</p>

<style>
  .diagramme {
    width: 100%;
    height: auto;
    display: block;
  }
  .grille {
    stroke: var(--texte-tertiaire);
    stroke-width: 0.5;
    opacity: 0.4;
  }
  .label-y {
    font-size: 9px;
    fill: var(--texte-tertiaire);
    dominant-baseline: middle;
    font-family: var(--font-body);
  }
  .label-gauche {
    text-anchor: end;
  }
  .label-droite {
    text-anchor: start;
  }
  .label-x {
    font-size: 10px;
    fill: var(--texte-tertiaire);
    text-anchor: middle;
    font-family: var(--font-body);
  }
  .legende {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.2rem;
    margin: 0.4rem 0 0;
    font-size: 0.78rem;
    color: var(--texte-tertiaire);
  }
  .legende span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .puce {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
</style>
