export type Point = { x: number; y: number | null };

/** Fonction affine domaine -> plage (px), utilisée pour projeter x et y sur le viewBox SVG. */
export function echelleLineaire(domaine: [number, number], plage: [number, number]): (v: number) => number {
  const [d0, d1] = domaine;
  const [p0, p1] = plage;
  if (d1 === d0) return () => (p0 + p1) / 2;
  return (v: number) => p0 + ((v - d0) / (d1 - d0)) * (p1 - p0);
}

/** Graduations « propres » (pas 1/2/5 × 10^n) couvrant [min, max], environ nbCible graduations. */
export function ticks(min: number, max: number, nbCible = 5): number[] {
  if (min === max) return [min];
  const etendue = max - min;
  const pasBrut = etendue / Math.max(1, nbCible);
  const magnitude = 10 ** Math.floor(Math.log10(pasBrut));
  const residu = pasBrut / magnitude;
  const pas = (residu >= 5 ? 10 : residu >= 2 ? 5 : residu >= 1 ? 2 : 1) * magnitude;

  const debut = Math.ceil(min / pas) * pas;
  const resultat: number[] = [];
  for (let v = debut; v <= max + pas * 1e-6; v += pas) {
    resultat.push(Math.round(v / pas) * pas);
  }
  return resultat;
}

/** Chemin SVG "M..L.." reliant les points projetés ; coupe la ligne aux valeurs y nulles (trous de données). */
export function cheminLigne(points: Array<{ x: number; y: number | null }>): string {
  let d = "";
  let trace = false;
  for (const p of points) {
    if (p.y === null) {
      trace = false;
      continue;
    }
    d += `${trace ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    trace = true;
  }
  return d.trim();
}
