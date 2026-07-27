import assert from "node:assert/strict";
import test from "node:test";
import { downloadStream } from "../src/download.js";

test("accepte un flux CSV officiel", async () => {
  const result = await downloadStream("https://example.test/waldec.csv", {
    timeoutMs: 1_000,
    fetchImpl: (async () =>
      new Response("id,titre\nW303000001,Association", {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      })) as typeof fetch,
  });

  assert.equal(result.status, 200);
  assert.equal(result.contentType, "text/csv; charset=utf-8");
  await result.body.cancel();
});

test("refuse une page HTML à la place du CSV", async () => {
  await assert.rejects(
    () =>
      downloadStream("https://example.test/waldec.csv", {
        timeoutMs: 1_000,
        fetchImpl: (async () =>
          new Response("<html>maintenance</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          })) as typeof fetch,
      }),
    /Type de contenu RNA invalide/,
  );
});
