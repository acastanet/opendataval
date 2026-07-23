import assert from "node:assert/strict";
import test from "node:test";
import { buildDepartments, parseBulletins, parseCard } from "../src/parser.js";

const card = {
  product: {
    id: "pub-1", update_time: "2026-07-23T14:00:00+02:00", extra_source_field: "accepted",
    periods: [
      { period_id: "J", begin_time: "2026-07-23T00:00:00+02:00", end_time: "2026-07-24T00:00:00+02:00", timelaps: { begin_time: "2026-07-23T14:00:00+02:00", end_time: "2026-07-23T22:00:00+02:00", domain_ids: [
        { domain_id: "30", domain_name: "Gard", max_color_id: "3", phenomenon_ids: [{ phenomenon_id: 3, color_id: 2 }, { phenomenon_id: 2, color_id: 3 }] },
        { domain_id: "2A", domain_name: "Corse-du-Sud", max_color_id: "1", phenomenon_ids: [] },
        { domain_id: "2B", domain_name: "Haute-Corse", max_color_id: "2", phenomenon_ids: [{ phenomenon_id: 99, color_id: 2, label: "Nouveau phénomène" }] },
      ] } },
      { period_id: "J1", begin_time: "2026-07-24T00:00:00+02:00", end_time: "2026-07-25T00:00:00+02:00", timelaps: { domain_ids: [
        { domain_id: "30", domain_name: "Gard", max_color_id: "1", phenomenon_ids: [] },
      ] } },
    ],
  },
};

test("parse aujourd'hui, demain, plusieurs phénomènes et Corse", () => {
  const parsed = parseCard(card);
  const gard = parsed.departments["30"];
  assert.equal(parsed.publicationId, "pub-1");
  assert.equal(gard.periods[0]?.day, "today");
  assert.equal(gard.periods[0]?.overallLevel.code, "orange");
  assert.deepEqual(gard.periods[0]?.phenomena.map((item) => item.code).sort(), ["rain_flood", "thunderstorm"]);
  assert.equal(gard.periods[1]?.day, "tomorrow");
  assert.equal(gard.periods[1]?.overallLevel.code, "green");
  assert.deepEqual(gard.periods[1]?.phenomena, []);
  assert.equal(parsed.departments["2A"]?.periods[0]?.overallLevel.code, "green");
  assert.equal(parsed.departments["2B"]?.periods[0]?.phenomena[0]?.code, "unknown");
  assert.ok(parsed.warnings.some((warning) => warning.code === "UNKNOWN_PHENOMENON"));
});

test("représente les quatre niveaux officiels", () => {
  const expected = ["green", "yellow", "orange", "red"];
  for (let sourceLevel = 1; sourceLevel <= 4; sourceLevel += 1) {
    const parsed = parseCard({ product: { periods: [{ period_id: "J", timelaps: { domain_ids: [{ domain_id: "30", max_color_id: sourceLevel, phenomenon_ids: [] }] } }] } });
    assert.equal(parsed.departments["30"]?.periods[0]?.overallLevel.code, expected[sourceLevel - 1]);
  }
});

test("fusionne une chronologie intra-journalière sans perdre le phénomène", () => {
  const parsed = parseCard({ product: { periods: [{ period_id: "J", timelaps: [
    { begin_time: "2026-07-23T08:00:00+02:00", end_time: "2026-07-23T12:00:00+02:00", domain_ids: [{ domain_id: "30", max_color_id: 2, phenomenon_ids: [{ phenomenon_id: 3, color_id: 2 }] }] },
    { begin_time: "2026-07-23T12:00:00+02:00", end_time: "2026-07-23T18:00:00+02:00", domain_ids: [{ domain_id: "30", max_color_id: 3, phenomenon_ids: [{ phenomenon_id: 3, color_id: 3 }] }] },
  ] }] } });
  const phenomenon = parsed.departments["30"]?.periods[0]?.phenomena[0];
  assert.equal(parsed.departments["30"]?.periods[0]?.overallLevel.code, "orange");
  assert.equal(phenomenon?.code, "thunderstorm");
  assert.equal(phenomenon?.timeline.length, 2);
  assert.equal(phenomenon?.level.code, "orange");
});

test("conserve les bulletins sans réécriture et les ordonne par portée", () => {
  const text = "Texte officiel strictement inchangé.";
  const bulletins = parseBulletins({ product: { bulletins: [
    { id: "n", type: "national", scope_code: "FR", text },
    { id: "z", type: "zone", zone_id: "SUD-EST", text: "Bulletin zonal" },
    { id: "d", type: "department", department_code: "30", title: "Bulletin de suivi", text },
  ] } });
  const departments = buildDepartments(parseCard(card), bulletins);
  assert.deepEqual(departments["30"]?.bulletins.map((item) => item.scope), ["department", "zone", "national"]);
  assert.equal(departments["30"]?.bulletins[0]?.text, text);
  assert.equal(departments["2A"]?.bulletins.length, 2);
});

test("un niveau absent reste inconnu et ne devient jamais vert", () => {
  const parsed = parseCard({ product: { periods: [{ period_id: "J", timelaps: { domain_ids: [{ domain_id: "30", phenomenon_ids: [] }] } }] } });
  assert.equal(parsed.departments["30"]?.periods[0]?.overallLevel.code, "unknown");
  assert.ok(parsed.departments["30"]?.warnings.some((warning) => warning.code === "UNKNOWN_LEVEL"));
});

test("accepte des dates manquantes sans en inventer", () => {
  const parsed = parseCard({ product: { periods: [{ period_id: "J", timelaps: { domain_ids: [{ domain_id: "30", max_color_id: 1, phenomenon_ids: [] }] } }] } });
  assert.equal(parsed.departments["30"]?.periods[0]?.validFrom, null);
  assert.equal(parsed.departments["30"]?.periods[0]?.validUntil, null);
  assert.equal(parsed.departments["30"]?.periods[0]?.date, null);
});

test("refuse une carte invalide au lieu de produire du vert", () => {
  assert.throws(() => parseCard({ product: { periods: [] } }), /Aucune période/);
  assert.throws(() => parseCard("non-json"), /Produit carte/);
});
