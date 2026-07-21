// Intégration du radar de précipitations RainViewer (https://www.rainviewer.com/api/weather-maps-api.html).
// API publique gratuite, sans clé, couverture mondiale (France comprise). Attribution « RainViewer » requise.
// Le radar mesure l'intensité des précipitations, PAS la foudre : ces helpers ne prétendent jamais détecter
// un « orage » au sens tonnerre, seulement des précipitations en cours et leur intensité approximative.

export type IntensiteRadar = "aucune" | "faible" | "moderee" | "forte";

export interface FrameRadar {
  time: number; // horodatage Unix (secondes)
  kind: "passe" | "prevu"; // observation radar passée ou extrapolation nowcast
  tileUrl: string; // gabarit de tuile prêt pour MapLibre, avec les jetons {z}/{x}/{y}
}

const HOTE_DEFAUT = "https://tilecache.rainviewer.com";
// Schéma couleur RainViewer 2 (« Universal Blue »), tuiles 256 px.
const COULEUR = "2";
// Carte : tuiles lissées (rendu). Échantillonnage : tuiles non lissées (lecture de pixel nette).
const OPTIONS_CARTE = "1_1";
const OPTIONS_ECHANTILLON = "0_1";

interface FrameBrute {
  time: number;
  path: string;
}

function estFrame(valeur: unknown): valeur is FrameBrute {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return false;
  const objet = valeur as Record<string, unknown>;
  return typeof objet.time === "number" && typeof objet.path === "string";
}

function racineRadar(data: unknown): { host: string; past: FrameBrute[]; nowcast: FrameBrute[] } {
  const racine = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const host = typeof racine.host === "string" ? racine.host : HOTE_DEFAUT;
  const radar = typeof racine.radar === "object" && racine.radar !== null && !Array.isArray(racine.radar)
    ? (racine.radar as Record<string, unknown>)
    : {};
  const past = Array.isArray(radar.past) ? radar.past.filter(estFrame) : [];
  const nowcast = Array.isArray(radar.nowcast) ? radar.nowcast.filter(estFrame) : [];
  return { host, past, nowcast };
}

export function hoteRadar(data: unknown): string {
  return racineRadar(data).host;
}

/**
 * Frames radar (passé + nowcast) avec un gabarit de tuile MapLibre prêt à l'emploi.
 * Les tuiles sont servies via notre propre proxy `/api/meteo/radar/tuile/...` : RainViewer n'envoie pas
 * d'en-tête CORS et MapLibre charge les tuiles raster par `fetch` (soumis au CORS), contrairement au
 * chargement par `<img>`. Passer par la même origine évite le blocage CORS et resserre la CSP.
 */
export function construireFramesRadar(data: unknown): { host: string; frames: FrameRadar[] } {
  const { host, past, nowcast } = racineRadar(data);
  const gabarit = (path: string): string => `/api/meteo/radar/tuile/{z}/{x}/{y}?path=${encodeURIComponent(path)}`;
  const frames: FrameRadar[] = [
    ...past.map((f) => ({ time: f.time, kind: "passe" as const, tileUrl: gabarit(f.path) })),
    ...nowcast.map((f) => ({ time: f.time, kind: "prevu" as const, tileUrl: gabarit(f.path) })),
  ];
  return { host, frames };
}

/** URL amont RainViewer d'une tuile de carte (schéma 2, lissée), reconstruite côté proxy. */
export function urlTuileCarte(path: string, z: number, x: number, y: number): string {
  return `${HOTE_DEFAUT}${path}/256/${z}/${x}/${y}/${COULEUR}/${OPTIONS_CARTE}.png`;
}

/** Valide un chemin de frame RainViewer (anti-SSRF pour le proxy de tuiles). */
export function cheminFrameValide(path: string): boolean {
  return /^\/v2\/radar\/(nowcast\/)?[0-9a-f]+$/.test(path);
}

/** Frame passée la plus récente, base de l'échantillon au point. */
export function derniereFramePassee(data: unknown): FrameBrute | null {
  const { past } = racineRadar(data);
  return past[past.length - 1] ?? null;
}

/** Coordonnées de tuile slippy (z/x/y) et pixel interne (0..255) d'un point WGS84. */
export function tuilePourPoint(lat: number, lon: number, z: number): { z: number; x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const xf = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  const borne = (v: number): number => Math.min(255, Math.max(0, Math.floor(v * 256)));
  return { z, x, y, px: borne(xf - x), py: borne(yf - y) };
}

/** URL de la tuile d'échantillonnage (non lissée) d'une frame donnée. */
export function urlTuileEchantillon(host: string, path: string, z: number, x: number, y: number): string {
  return `${host}${path}/256/${z}/${x}/${y}/${COULEUR}/${OPTIONS_ECHANTILLON}.png`;
}

/**
 * Classe un pixel RGBA du schéma RainViewer 2 en intensité de précipitation.
 * Approximation assumée : palette du bleu clair (faible) au vert/jaune (modérée) puis rouge/magenta (forte).
 * Un pixel quasi transparent signifie « pas de précipitation ».
 */
export function classerIntensitePixel(r: number, g: number, b: number, a: number): IntensiteRadar {
  if (a < 40) return "aucune";
  if (b > g && b > r) return "faible"; // bleu dominant → pluie faible
  if (r >= 180 && g < 160) return "forte"; // rouge / magenta → forte
  return "moderee"; // vert / jaune / orange → modérée
}

const ORDRE_INTENSITE: Record<IntensiteRadar, number> = { aucune: 0, faible: 1, moderee: 2, forte: 3 };

/** Intensité maximale sur le voisinage 3×3 du pixel visé (robustesse au sous-échantillonnage radar). */
export function intensiteVoisinage(rgba: Uint8Array, largeur: number, hauteur: number, px: number, py: number): IntensiteRadar {
  let max: IntensiteRadar = "aucune";
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = px + dx;
      const y = py + dy;
      if (x < 0 || y < 0 || x >= largeur || y >= hauteur) continue;
      const i = (y * largeur + x) * 4;
      const classe = classerIntensitePixel(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0, rgba[i + 3] ?? 0);
      if (ORDRE_INTENSITE[classe] > ORDRE_INTENSITE[max]) max = classe;
    }
  }
  return max;
}
