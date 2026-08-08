import { moduleGeographie } from "./geographie.js";

export const SPHERES_DALLE = [
  { id: "atmosphere", label: "Atmosphère", couleur: "#0B6F8B" },
  { id: "hydrosphere", label: "Hydrosphère", couleur: "#1769AA" },
  { id: "biosphere", label: "Biosphère", couleur: "#52663A" },
  { id: "anthroposphere", label: "Anthroposphère", couleur: "#345E70" },
  { id: "lithosphere", label: "Lithosphère", couleur: "#6B4226" },
  { id: "risks", label: "Risques", couleur: "#B94A1E" },
];

/** Ajouter un microservice au viewer revient à ajouter son module à ce registre. */
export const MODULES_DALLE = [moduleGeographie];

export function modulesConcernant(manifeste, modules = MODULES_DALLE) {
  return modules.filter((module) => module.concerne(manifeste));
}

export function donneesGeneriques(manifeste, sphere, modules = MODULES_DALLE) {
  const actifs = modulesConcernant(manifeste, modules);
  return (manifeste.data?.[sphere] ?? []).filter((donnee) =>
    !actifs.some((module) => module.sphere === sphere && module.reclame?.(donnee)),
  );
}

export function spheresOrdonnees(manifeste, modules = MODULES_DALLE) {
  const actifs = modulesConcernant(manifeste, modules);
  return SPHERES_DALLE.map((sphere) => ({
    ...sphere,
    donnees: manifeste.data?.[sphere.id] ?? [],
    modules: actifs.filter((module) => module.sphere === sphere.id),
    generiques: donneesGeneriques(manifeste, sphere.id, modules),
  }));
}
