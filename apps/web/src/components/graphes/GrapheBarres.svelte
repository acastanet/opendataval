<script>
  import { echelleLineaire, ticks } from "../../lib/graphe";

  /** [{x, valeur}] — valeur peut être null (mois/année sans donnée). */
  export let barres = [];
  export let couleur = "#3e6e82";
  export let formatX = (v) => String(v);
  export let formatY = (v) => String(v);
  export let hauteur = 200;

  const LARGEUR = 720;
  const MARGE = { haut: 12, droite: 16, bas: 28, gauche: 44 };

  $: largeurTrace = LARGEUR - MARGE.gauche - MARGE.droite;
  $: hauteurTrace = hauteur - MARGE.haut - MARGE.bas;

  $: valeurs = barres.map((b) => b.valeur).filter((v) => v !== null && v !== undefined);
  $: yMax = valeurs.length ? Math.max(...valeurs, 0) : 1;
  $: yMin = valeurs.length ? Math.min(0, ...valeurs) : 0;

  $: echelleY = echelleLineaire([yMin, yMax], [MARGE.haut + hauteurTrace, MARGE.haut]);
  $: ticksYCalcules = ticks(yMin, yMax, 5);

  $: pas = barres.length ? largeurTrace / barres.length : 0;
  $: largeurBarre = pas * 0.7;
  $: pasEtiquette = barres.length > 14 ? Math.ceil(barres.length / 14) : 1;
</script>

<svg viewBox={`0 0 ${LARGEUR} ${hauteur}`} role="img" class="graphe">
  {#each ticksYCalcules as t}
    <line x1={MARGE.gauche} x2={LARGEUR - MARGE.droite} y1={echelleY(t)} y2={echelleY(t)} class="grille" />
    <text x={MARGE.gauche - 6} y={echelleY(t)} class="label-y">{formatY(t)}</text>
  {/each}
  {#each barres as b, i}
    {#if b.valeur !== null && b.valeur !== undefined}
      <rect
        x={MARGE.gauche + i * pas + (pas - largeurBarre) / 2}
        y={Math.min(echelleY(0), echelleY(b.valeur))}
        width={largeurBarre}
        height={Math.abs(echelleY(b.valeur) - echelleY(0))}
        fill={couleur}
      />
    {/if}
    {#if i % pasEtiquette === 0}
      <text x={MARGE.gauche + i * pas + pas / 2} y={hauteur - 8} class="label-x">{formatX(b.x)}</text>
    {/if}
  {/each}
</svg>

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
</style>
