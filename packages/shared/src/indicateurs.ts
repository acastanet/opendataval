import type { SectionSlug } from "./sections.js";

/**
 * Registre des indicateurs = séries temporelles non cartographiques (INSEE, OFGL/DGFiP…).
 * Généralise le pattern météo : une entrée ici + un endpoint /api/indicateurs/:slug +
 * l'île GrapheIndicateur suffisent à restituer une courbe. Client-safe (aucun import `pg`),
 * importable via `@opendata-vda/shared/indicateurs`.
 */
export interface DefinitionIndicateur {
  slug: string; // = series.indicateurs.indicateur
  libelle: string;
  unite: string;
  source: string; // slug SourceAmont
  section: SectionSlug;
  representation: "ligne" | "barres";
  decimales?: number;
}

export const INDICATEURS = [
  {
    slug: "population_municipale",
    libelle: "Population municipale",
    unite: "habitants",
    source: "insee_population",
    section: "population",
    representation: "ligne",
    decimales: 0,
  },
] as const satisfies readonly DefinitionIndicateur[];

export const INDICATEURS_PAR_SLUG: Map<string, DefinitionIndicateur> = new Map(
  INDICATEURS.map((i) => [i.slug, i]),
);

export function indicateursDeSection(slug: SectionSlug): DefinitionIndicateur[] {
  return INDICATEURS.filter((i) => i.section === slug);
}
