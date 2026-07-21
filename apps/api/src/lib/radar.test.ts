import assert from "node:assert/strict";
import test from "node:test";
import {
  cheminFrameValide,
  classerIntensitePixel,
  construireFramesRadar,
  derniereFramePassee,
  intensiteVoisinage,
  tuilePourPoint,
  urlTuileCarte,
  urlTuileEchantillon,
} from "./radar.js";

const exempleRainViewer = {
  host: "https://tilecache.rainviewer.com",
  radar: {
    past: [
      { time: 1784577000, path: "/v2/radar/aaa" },
      { time: 1784577600, path: "/v2/radar/bbb" },
    ],
    nowcast: [{ time: 1784578200, path: "/v2/radar/nowcast/ccc" }],
  },
};

test("construireFramesRadar concatène passé puis nowcast avec un gabarit MapLibre", () => {
  const { host, frames } = construireFramesRadar(exempleRainViewer);
  assert.equal(host, "https://tilecache.rainviewer.com");
  assert.equal(frames.length, 3);
  const premiere = frames[0];
  const derniere = frames[2];
  assert.ok(premiere && derniere);
  assert.equal(premiere.kind, "passe");
  assert.equal(derniere.kind, "prevu");
  assert.equal(premiere.tileUrl, "/api/meteo/radar/tuile/{z}/{x}/{y}?path=%2Fv2%2Fradar%2Faaa");
});

test("urlTuileCarte reconstruit l'URL amont RainViewer (schéma 2 lissé)", () => {
  assert.equal(
    urlTuileCarte("/v2/radar/aaa", 9, 261, 186),
    "https://tilecache.rainviewer.com/v2/radar/aaa/256/9/261/186/2/1_1.png",
  );
});

test("cheminFrameValide n'accepte que les chemins de frame RainViewer", () => {
  assert.equal(cheminFrameValide("/v2/radar/9f19d6f2558f"), true);
  assert.equal(cheminFrameValide("/v2/radar/nowcast/abc123"), true);
  assert.equal(cheminFrameValide("/v2/radar/../../etc/passwd"), false);
  assert.equal(cheminFrameValide("https://evil.example/x"), false);
  assert.equal(cheminFrameValide(""), false);
});

test("construireFramesRadar tolère une réponse vide ou malformée", () => {
  assert.deepEqual(construireFramesRadar(null).frames, []);
  assert.deepEqual(construireFramesRadar({ radar: { past: "x" } }).frames, []);
});

test("derniereFramePassee renvoie la frame passée la plus récente", () => {
  assert.deepEqual(derniereFramePassee(exempleRainViewer), { time: 1784577600, path: "/v2/radar/bbb" });
  assert.equal(derniereFramePassee({ radar: { past: [] } }), null);
});

test("tuilePourPoint place le point dans la bonne tuile slippy", () => {
  assert.deepEqual(tuilePourPoint(0, 0, 1), { z: 1, x: 1, y: 1, px: 0, py: 0 });
  const t = tuilePourPoint(44.0646, 3.683, 9);
  assert.equal(t.z, 9);
  assert.ok(Number.isInteger(t.x) && t.x >= 0 && t.x < 512);
  assert.ok(Number.isInteger(t.y) && t.y >= 0 && t.y < 512);
  assert.ok(t.px >= 0 && t.px <= 255 && t.py >= 0 && t.py <= 255);
});

test("urlTuileEchantillon utilise le schéma 2 non lissé", () => {
  assert.equal(
    urlTuileEchantillon("https://h", "/v2/radar/aaa", 9, 261, 180),
    "https://h/v2/radar/aaa/256/9/261/180/2/0_1.png",
  );
});

test("classerIntensitePixel distingue transparent, bleu, vert et rouge", () => {
  assert.equal(classerIntensitePixel(0, 0, 0, 0), "aucune");
  assert.equal(classerIntensitePixel(100, 180, 255, 255), "faible"); // bleu clair
  assert.equal(classerIntensitePixel(0, 200, 0, 255), "moderee"); // vert
  assert.equal(classerIntensitePixel(255, 0, 0, 255), "forte"); // rouge
  assert.equal(classerIntensitePixel(255, 0, 255, 255), "forte"); // magenta
});

test("intensiteVoisinage retient l'intensité maximale du bloc 3×3", () => {
  const largeur = 3;
  const hauteur = 3;
  const rgba = new Uint8Array(largeur * hauteur * 4);
  // Tout transparent sauf un pixel rouge en (2,2).
  const i = (2 * largeur + 2) * 4;
  rgba[i] = 255;
  rgba[i + 1] = 0;
  rgba[i + 2] = 0;
  rgba[i + 3] = 255;
  assert.equal(intensiteVoisinage(rgba, largeur, hauteur, 1, 1), "forte");
  assert.equal(intensiteVoisinage(rgba, largeur, hauteur, 0, 0), "aucune");
});
