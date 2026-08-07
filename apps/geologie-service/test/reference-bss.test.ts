import assert from "node:assert/strict";
import test from "node:test";
import { referenceValide, urlFicheInfoterre } from "../src/domain/reference-bss.js";

test("accepte les références BSS réelles vérifiées", () => {
  assert.equal(referenceValide("09372X0012/MONNA"), true);
  assert.equal(referenceValide("09371X0028/VA-2A"), true);
});

test("rejette les tentatives d'injection et les formats invalides", () => {
  assert.equal(referenceValide("../../../etc/passwd"), false);
  assert.equal(referenceValide("http://evil.com/x"), false);
  assert.equal(referenceValide("09372X0012MONNA"), false, "sans /");
  assert.equal(referenceValide("0012X0012/MONNA"), false, "4 chiffres au lieu de 5");
  assert.equal(referenceValide(""), false);
  assert.equal(referenceValide("09372x0012/MONNA"), false, "lettre en minuscule");
});

test("reconstruit toujours l'URL InfoTerre côté serveur, en encodant la référence", () => {
  assert.equal(
    urlFicheInfoterre("09372X0012/MONNA"),
    "http://ficheinfoterre.brgm.fr/InfoterreFiche/ficheBss.action?id=09372X0012%2FMONNA",
  );
});
