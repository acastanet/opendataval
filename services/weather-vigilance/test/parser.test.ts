import test from "node:test";
import assert from "node:assert/strict";
import { parseBulletinProduct, parseMapProduct, SourceFormatError } from "../src/domain.js";

const mapFixture = {
  product: {
    update_time: "2026-07-23T14:00:00Z",
    periods: [
      {
        echeance: "J",
        begin_validity_time: "2026-07-23T04:00:00Z",
        end_validity_time: "2026-07-23T22:00:00Z",
        timelaps: { domain_ids: [
          { domain_id: "30", domain_name: "Gard", max_color_id: 2, phenomenon_items: [
            { phenomenon_id: "3", phenomenon_max_color_id: 2, timelaps_items: [{ begin_time: "2026-07-23T12:00:00Z", end_time: "2026-07-23T20:00:00Z", color_id: 2 }] },
            { phenomenon_id: "1", phenomenon_max_color_id: 1, timelaps_items: [] },
          ] },
          { domain_id: "2A", domain_name: "Corse-du-Sud", max_color_id: 1, phenomenon_items: [] },
        ] },
      },
      {
        echeance: "J1",
        begin_validity_time: "2026-07-23T22:00:00Z",
        end_validity_time: "2026-07-24T22:00:00Z",
        timelaps: { domain_ids: [
          { domain_id: "30", domain_name: "Gard", max_color_id: 1, phenomenon_items: [] },
          { domain_id: "2A", domain_name: "Corse-du-Sud", max_color_id: 3, phenomenon_items: [{ phenomenon_id: "99", phenomenon_name: "Nouveau phénomène", phenomenon_max_color_id: 3, timelaps_items: [] }] },
        ] },
      },
    ],
    meta: { snapshot_id: "snapshot-1", product_datetime: "2026-07-23T14:00:00Z", generation_timestamp: "2026-07-23T14:00:10Z" },
  },
};

test("parse aujourd'hui, demain, chronologie, 2A et phénomène inconnu", () => {
  const parsed = parseMapProduct(mapFixture);
  assert.equal(parsed.departments["30"]?.periods[0]?.overall_level.code, "yellow");
  assert.equal(parsed.departments["30"]?.periods[0]?.phenomena[0]?.code, "thunderstorm");
  assert.equal(parsed.departments["30"]?.periods[1]?.overall_level.code, "green");
  assert.deepEqual(parsed.departments["30"]?.periods[1]?.phenomena, []);
  assert.equal(parsed.departments["2A"]?.periods[1]?.phenomena[0]?.code, "unknown");
  assert.equal(parsed.departments["2A"]?.warnings[0]?.code, "UNKNOWN_PHENOMENON");
});

for (const [sourceLevel, expected] of [[1, "green"], [2, "yellow"], [3, "orange"], [4, "red"]] as const) {
  test(`normalise le niveau ${sourceLevel} en ${expected}`, () => {
    const fixture = structuredClone(mapFixture);
    fixture.product.periods[0]!.timelaps.domain_ids[0]!.max_color_id = sourceLevel;
    fixture.product.periods[0]!.timelaps.domain_ids[0]!.phenomenon_items = sourceLevel === 1 ? [] : [{ phenomenon_id: "3", phenomenon_max_color_id: sourceLevel, timelaps_items: [] }];
    assert.equal(parseMapProduct(fixture).departments["30"]?.periods[0]?.overall_level.code, expected);
  });
}

test("accepte aussi le département 2B", () => {
  const fixture = structuredClone(mapFixture);
  fixture.product.periods[0]!.timelaps.domain_ids.push({ domain_id: "2B", domain_name: "Haute-Corse", max_color_id: 1, phenomenon_items: [] });
  assert.equal(parseMapProduct(fixture).departments["2B"]?.department_name, "Haute-Corse");
});

test("refuse un niveau source inconnu", () => {
  const invalid = structuredClone(mapFixture);
  invalid.product.periods[0]!.timelaps.domain_ids[0]!.max_color_id = 9;
  assert.throws(() => parseMapProduct(invalid), SourceFormatError);
});

test("extrait sans réécriture le bulletin départemental", () => {
  const parsed = parseBulletinProduct({ product: {
    update_time: "2026-07-23T14:00:00Z",
    text_bloc_items: [{ domain_id: "30", bloc_id: "BULLETIN_DEPARTEMENTAL", bloc_title: "Bulletin de suivi", bloc_items: [{ text_items: [{ term_items: [{ start_time: "2026-07-23T14:00:00Z", end_time: "2026-07-23T22:00:00Z", subdivision_text: [{ text: ["Texte officiel.", "Conseil officiel."] }] }] }] }] }],
    meta: { product_datetime: "2026-07-23T14:00:00Z" },
  } }, ["30"]);
  assert.equal(parsed.byDepartment["30"]?.[0]?.text, "Texte officiel.\nConseil officiel.");
  assert.equal(parsed.byDepartment["30"]?.[0]?.scope, "department");
});
