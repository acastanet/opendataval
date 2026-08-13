import test from "node:test";
import assert from "node:assert/strict";
import { construireStyle, lireOptionsStyle } from "../src/domain/styles.js";

const options = lireOptionsStyle({ fond: "plan", terrain: "1", exageration: "1.4", geologie: "1", teintes: "1" });

type Couche = { id: string; type: string; layout?: { visibility?: string }; paint?: Record<string, unknown> };

function couche(style: Record<string, unknown>, id: string): Couche {
  const trouvee = (style.layers as Couche[]).find((layer) => layer.id === id);
  assert.ok(trouvee, `couche ${id} absente du style`);
  return trouvee;
}

test("construit un style unique valide", () => {
  const style = construireStyle(options);
  assert.equal(style.version, 8);
  assert.ok(Array.isArray(style.layers));
});

test("fige les identifiants canoniques et leur ordre", () => {
  const ids = (construireStyle(options).layers as Couche[]).map((layer) => layer.id);
  assert.deepEqual(ids, [
    "fond-uni",
    "basemap-plan",
    "basemap-photo",
    "basemap-satellite",
    "geologie-layer",
    "relief-color",
    "relief-hillshade",
  ]);
});

test("le fond uni est une option visible par défaut, basculable comme les autres couches", () => {
  // Sans lui, un fond "nu" laisse voir la transparence du canevas : en 3D, les bords du
  // relief au-delà de RELIEF_BOUNDS semblent alors plonger à la verticale.
  const parDefaut = couche(construireStyle(lireOptionsStyle({ fond: "nu" })), "fond-uni");
  assert.equal(parDefaut.type, "background");
  assert.equal(parDefaut.layout?.visibility, "visible");
  assert.ok(parDefaut.paint?.["background-color"]);

  const masque = couche(construireStyle(lireOptionsStyle({ fondOpaque: "0" })), "fond-uni");
  assert.equal(masque.layout?.visibility, "none");
});

test("garde toutes les couches présentes et ne pilote que leur visibilité", () => {
  const minimal = construireStyle(lireOptionsStyle({ fond: "nu", ombrage: "aucun", fondOpaque: "0" }));
  const ids = (minimal.layers as Couche[]).map((layer) => layer.id);
  assert.equal(ids.length, 7);
  assert.ok((minimal.layers as Couche[]).every((layer) => layer.layout?.visibility === "none"));

  const complet = construireStyle(lireOptionsStyle({ fond: "photo", geologie: "1", teintes: "1" }));
  assert.equal(couche(complet, "basemap-photo").layout?.visibility, "visible");
  assert.equal(couche(complet, "basemap-plan").layout?.visibility, "none");
  assert.equal(couche(complet, "geologie-layer").layout?.visibility, "visible");
  assert.equal(couche(complet, "geologie-layer").paint?.["raster-opacity"], 1);
  assert.equal(couche(complet, "relief-color").layout?.visibility, "visible");
});

test("traduit chaque préréglage d’ombrage en méthode MapLibre", () => {
  const methodes: Record<string, string> = { doux: "igor", naturel: "basic", sculpte: "combined", multi: "multidirectional" };
  for (const [prereglage, methode] of Object.entries(methodes)) {
    const hillshade = couche(construireStyle(lireOptionsStyle({ ombrage: prereglage })), "relief-hillshade");
    assert.equal(hillshade.layout?.visibility, "visible");
    assert.equal(hillshade.paint?.["hillshade-method"], methode);
    // Sans ancrage sur la carte, l'ombrage tourne avec le cap de la caméra.
    assert.equal(hillshade.paint?.["hillshade-illumination-anchor"], "map");
  }
});

test("le préréglage multi fournit autant de teintes que de directions", () => {
  const hillshade = couche(construireStyle(lireOptionsStyle({ ombrage: "multi" })), "relief-hillshade");
  const directions = hillshade.paint?.["hillshade-illumination-direction"] as number[];
  const highlights = hillshade.paint?.["hillshade-highlight-color"] as string[];
  const shadows = hillshade.paint?.["hillshade-shadow-color"] as string[];
  // Le shader compile autant de sources lumineuses que hillshade-highlight-color compte
  // de valeurs : une seule teinte réduirait silencieusement les quatre azimuts à un.
  assert.equal(directions.length, 4);
  assert.equal(highlights.length, 4);
  assert.equal(shadows.length, 4);
});

test("l’ombrage « aucun » masque la couche sans la retirer", () => {
  const hillshade = couche(construireStyle(lireOptionsStyle({ ombrage: "aucun" })), "relief-hillshade");
  assert.equal(hillshade.layout?.visibility, "none");
  assert.ok(hillshade.paint?.["hillshade-method"]);
});

test("le terrain 3D pose l’exagération et le ciel", () => {
  const avec = construireStyle(lireOptionsStyle({ terrain: "1", exageration: "2.2" }));
  assert.deepEqual(avec.terrain, { source: "relief-terrain-src", exaggeration: 2.2 });
  assert.equal((avec.sky as Record<string, unknown>)["fog-ground-blend"], 0.35);

  const sans = construireStyle(lireOptionsStyle({}));
  assert.equal(sans.terrain, undefined);
  assert.equal(sans.sky, undefined);
});

test("sert le modèle d’altitude en WebP", () => {
  const source = (construireStyle(options).sources as Record<string, { tiles: string[]; encoding: string }>)["relief-dem-src"];
  assert.equal(source.encoding, "terrarium");
  assert.deepEqual(source.tiles, ["/api/v2/map/relief/{z}/{x}/{y}.webp"]);
});

test("isole la source du terrain de celle de l’ombrage", () => {
  type Source = { tiles: string[]; tileSize: number };
  const sources = construireStyle(lireOptionsStyle({ terrain: "1" })).sources as Record<string, Source>;
  // Une source branchée sur `terrain` voit MapLibre descendre d'un cran le zoom de ses
  // tuiles : la partager avec l'ombrage diviserait par deux la résolution de celui-ci.
  assert.ok(sources["relief-terrain-src"], "source de terrain absente");
  assert.deepEqual(sources["relief-terrain-src"].tiles, sources["relief-dem-src"].tiles);
  assert.equal(sources["relief-dem-src"].tileSize, 512);
  assert.equal(sources["relief-terrain-src"].tileSize, 256);

  const style = construireStyle(lireOptionsStyle({ terrain: "1" }));
  assert.equal((style.terrain as { source: string }).source, "relief-terrain-src");
  const hillshade = (style.layers as { id: string; source: string }[]).find((layer) => layer.id === "relief-hillshade");
  assert.equal(hillshade?.source, "relief-dem-src");
});

test("déclare la source de terrain même sans terrain 3D", () => {
  // Une source qui apparaît et disparaît fait échouer le diff de style de MapLibre, qui
  // reconstruit alors tout le style ; sans couche ni terrain, elle ne charge aucune tuile.
  const sources = construireStyle(lireOptionsStyle({})).sources as Record<string, unknown>;
  assert.ok(sources["relief-terrain-src"]);
});

test("plafonne chaque fond à la couverture réelle de l’amont", () => {
  type Source = { maxzoom?: number };
  const sources = construireStyle(options).sources as Record<string, Source>;
  assert.equal(sources["fond-plan-src"].maxzoom, 19);
  assert.equal(sources["fond-photo-src"].maxzoom, 19);
  assert.equal(sources["fond-satellite-src"].maxzoom, 17);
  assert.equal(sources["geologie-src"].maxzoom, 16);
});

test("bascule les deux sources d’altitude en haute définition", () => {
  type Source = { tiles: string[]; maxzoom: number; attribution: string };
  const sources = construireStyle(lireOptionsStyle({ altitude: "hd", terrain: "1" })).sources as Record<string, Source>;
  for (const id of ["relief-dem-src", "relief-terrain-src"]) {
    assert.deepEqual(sources[id].tiles, ["/api/v2/map/relief-hd/{z}/{x}/{y}.png"]);
    // Un seul niveau au-dessus de l'archive : au-delà, la source de 1 m n'a plus rien à donner.
    assert.equal(sources[id].maxzoom, 16);
    assert.match(sources[id].attribution, /IGN/);
  }
  // Les deux modèles ne coïncident pas au mètre près : mélanger les niveaux créerait des
  // ressauts aux jointures, la pyramide entière bascule donc d'un coup.
  const standard = construireStyle(lireOptionsStyle({})).sources as Record<string, Source>;
  assert.deepEqual(standard["relief-dem-src"].tiles, ["/api/v2/map/relief/{z}/{x}/{y}.webp"]);
  assert.equal(standard["relief-dem-src"].maxzoom, 15);
});

test("refuse une définition de relief inconnue", () => {
  assert.throws(() => lireOptionsStyle({ altitude: "ultra" }), /standard/);
});

test("préfixe toutes les sources et couches", () => {
  const style = construireStyle({ ...options, prefixe: "principal" });
  assert.ok(Object.keys(style.sources as object).every((id) => id.startsWith("principal-")));
  assert.ok((style.layers as Couche[]).every((layer) => layer.id.startsWith("principal-")));
});

test("refuse un préfixe invalide", () => {
  assert.throws(() => lireOptionsStyle({ prefixe: "../x" }), /préfixe cartographique/);
});

test("refuse un ombrage inconnu", () => {
  assert.throws(() => lireOptionsStyle({ ombrage: "brutal" }), /ombrage/);
});
