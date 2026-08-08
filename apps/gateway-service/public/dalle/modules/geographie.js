const CLES_GEOGRAPHIE = new Set(["commune", "adresse"]);

export const moduleGeographie = {
  id: "geographie",
  sphere: "anthroposphere",

  concerne(manifeste) {
    return (manifeste.data?.anthroposphere ?? []).some((donnee) =>
      CLES_GEOGRAPHIE.has(donnee.key),
    );
  },

  reclame(donnee) {
    return CLES_GEOGRAPHIE.has(donnee.key);
  },

  panneau(manifeste, ctx) {
    for (const donnee of manifeste.data?.anthroposphere ?? []) {
      if (this.reclame(donnee)) ctx.ajouterDonnee(donnee, { module: this.id });
    }
  },

  provenance(manifeste) {
    return (manifeste.data?.anthroposphere ?? [])
      .filter((donnee) => this.reclame(donnee))
      .map((donnee) => donnee.source);
  },
};
