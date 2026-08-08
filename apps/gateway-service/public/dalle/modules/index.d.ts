export interface ModuleDalle {
  id: string;
  sphere: string;
  concerne(manifeste: any): boolean;
  reclame?(donnee: any): boolean;
  panneau?(manifeste: any, ctx: any): void;
  couche?(scene: any, manifeste: any, ctx: any): void;
  carte?(cible: any): void;
  provenance?(manifeste: any): any[];
}

export const SPHERES_DALLE: ReadonlyArray<{ id: string; label: string; couleur: string }>;
export const MODULES_DALLE: ReadonlyArray<ModuleDalle>;
export function modulesConcernant(manifeste: any, modules?: ReadonlyArray<ModuleDalle>): ModuleDalle[];
export function donneesGeneriques(manifeste: any, sphere: string, modules?: ReadonlyArray<ModuleDalle>): any[];
export function spheresOrdonnees(manifeste: any, modules?: ReadonlyArray<ModuleDalle>): Array<{
  id: string;
  label: string;
  couleur: string;
  donnees: any[];
  modules: ModuleDalle[];
  generiques: any[];
}>;
