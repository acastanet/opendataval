import assert from "node:assert/strict";
import test from "node:test";
import { firmsQueryWindows, parseCapXml, parseFirmsCsv } from "../src/domain.js";

test("découpe sept jours en deux requêtes FIRMS compatibles", () => {
  assert.deepEqual(firmsQueryWindows(7, new Date("2026-07-24T21:00:00Z")), [
    { dayRange: 5 },
    { dayRange: 2, startDate: "2026-07-18" },
  ]);
});

test("conserve les confiances basses et applique le rayon exact", () => {
  const csv = [
    "latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight,type",
    "44.01,3.00,2026-07-24,2030,N21,VIIRS,l,2.1,N,0",
    "45.00,3.00,2026-07-24,2030,N21,VIIRS,h,20,D,0",
  ].join("\n");
  const detections = parseFirmsCsv(csv, "VIIRS_NOAA21_NRT", { latitude: 44, longitude: 3 }, 50);
  assert.equal(detections.length, 1);
  assert.equal(detections[0]?.confidence.normalized, "low");
});

test("parse un produit CAP et conserve une suspicion low", () => {
  const xml = `<?xml version="1.0"?><alert><identifier>fire-1</identifier><sent>2026-07-24T20:40:00Z</sent><info>
    <event>Fire</event><certainty>Observed</certainty><parameter><valueName>fireResult</valueName><value>low</value></parameter>
    <parameter><valueName>FRP</valueName><value>8.2</value></parameter><area><circle>44.1,3.1 1</circle></area>
  </info></alert>`;
  const detections = parseCapXml(xml, "EUMETSAT_MTG_CAP", { latitude: 44, longitude: 3 }, 50);
  assert.equal(detections.length, 1);
  assert.equal(detections[0]?.confidence.normalized, "low");
  assert.equal(detections[0]?.frp_mw, 8.2);
  assert.equal(detections[0]?.pixel_radius_km, 1);
});
