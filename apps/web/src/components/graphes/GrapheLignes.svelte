<script>
  import { echelleLineaire, ticks, cheminLigne } from "../../lib/graphe";

  /** [{ nom, couleur, points: [{x, y}] }] — y peut être null (trou de données). */
  export let series = [];
  export let formatX = (v) => String(v);
  export let formatY = (v) => String(v);
  export let ligneZero = false;
  /** { valeur, label } — trace une ligne horizontale de référence (ex. moyenne climatique). */
  export let ligneReference = null;
  /** Valeurs x explicites pour l'axe ; sinon calculées automatiquement. */
  export let ticksX = null;
  export let hauteur = 260;

  const LARGEUR = 720;
  const MARGE = { haut: 12, droite: 16, bas: 28, gauche: 44 };

  $: largeurTrace = LARGEUR - MARGE.gauche - MARGE.droite;
  $: hauteurTrace = hauteur - MARGE.haut - MARGE.bas;

  $: tousPoints = series.flatMap((s) => s.points);
  $: xs = tousPoints.map((p) => p.x);
  $: ysValides = tousPoints.filter((p) => p.y !== null && p.y !== undefined).map((p) => p.y);

  $: xMin = xs.length ? Math.min(...xs) : 0;
  $: xMax = xs.length ? Math.max(...xs) : 1;

  $: yValeurs = [...ysValides, ...(ligneZero ? [0] : []), ...(ligneReference ? [ligneReference.valeur] : [])];
  $: yBrutMin = yValeurs.length ? Math.min(...yValeurs) : 0;
  $: yBrutMax = yValeurs.length ? Math.max(...yValeurs) : 1;
  $: marge = (yBrutMax - yBrutMin) * 0.08 || 1;
  $: yMin = yBrutMin - marge;
  $: yMax = yBrutMax + marge;

  $: echelleX = echelleLineaire([xMin, xMax], [MARGE.gauche, MARGE.gauche + largeurTrace]);
  $: echelleY = echelleLineaire([yMin, yMax], [MARGE.haut + hauteurTrace, MARGE.haut]);

  $: ticksYCalcules = ticks(yMin, yMax, 5);
  $: ticksXCalcules = ticksX ?? ticks(xMin, xMax, 6);

  $: seriesProjetees = series.map((s) => ({
    ...s,
    chemin: cheminLigne(
      s.points.map((p) => ({ x: echelleX(p.x), y: p.y === null || p.y === undefined ? null : echelleY(p.y) })),
    ),
  }));
</script>

<svg viewBox={`0 0 ${LARGEUR} ${hauteur}`} role="img" aria-label={series.map((s) => s.nom).join(", ")} class="graphe">
  {#each ticksYCalcules as t}
    <line x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={echelleY(t)} y2={echelleY(t)} class="grille" />
    <text x={MARGE.gauche - 6} y={echelleY(t)} class="label-y">{formatY(t)}</text>
  {/each}
  {#each ticksXCalcules as t}
    <text x={echelleX(t)} y={hauteur - 8} class="label-x">{formatX(t)}</text>
  {/each}
  {#if ligneZero}
    <line x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={echelleY(0)} y2={echelleY(0)} class="ligne-zero" />
  {/if}
  {#if ligneReference}
    <line
      x1={MARGE.gauche}
      x2={LARGEUR - MARGE.droite}
      y1={echelleY(ligneReference.valeur)}
      y2={echelleY(ligneReference.valeur)}
      class="ligne-reference"
    />
  {/if}
  {#each seriesProjetees as s}
    <path d={s.chemin} fill="none" stroke={s.couleur} stroke-width="1.8" />
  {/each}
</svg>

{#if series.length > 1}
  <ul class="legende">
    {#each series as s}
      <li><span class="puce" style={`background:${s.couleur}`}></span>{s.nom}</li>
    {/each}
  </ul>
{/if}

<style>
  .graphe {
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
    text-anchor: end;
    dominant-baseline: middle;
    font-family: var(--font-body);
  }
  .label-x {
    font-size: 9px;
    fill: var(--texte-tertiaire);
    text-anchor: middle;
    font-family: var(--font-body);
  }
  .ligne-zero {
    stroke: var(--texte-tertiaire);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }
  .ligne-reference {
    stroke: var(--alerte);
    stroke-width: 1;
    stroke-dasharray: 4 3;
    opacity: 0.75;
  }
  .legende {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    font-size: 0.78rem;
    color: var(--texte-tertiaire);
  }
  .legende li {
    display: flex;
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
