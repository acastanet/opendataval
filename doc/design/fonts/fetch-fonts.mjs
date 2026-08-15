#!/usr/bin/env node
/**
 * Récupère les polices du référentiel Style VAL et les dépose dans ce dossier.
 *
 *   node doc/design/fonts/fetch-fonts.mjs
 *
 * Aucune dépendance. Les binaires ne sont pas versionnés (voir .gitignore) :
 * ils se re-téléchargent en une commande, ce qui évite d'alourdir le dépôt
 * tout en gardant l'installation reproductible.
 *
 * Le référentiel reste correct sans ces fichiers — la pile de repli système
 * est la référence de base, la police web n'est qu'une amélioration. Ce script
 * ne doit donc jamais bloquer un build.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));

const POLICES = [
  {
    fichier: 'SourceSerif4-Variable.woff2',
    nom: 'Source Serif 4 (variable, Roman)',
    licence: 'SIL OFL 1.1',
    url: 'https://raw.githubusercontent.com/adobe-fonts/source-serif/release/WOFF2/VAR/SourceSerif4Variable-Roman.otf.woff2',
    secours: 'https://github.com/adobe-fonts/source-serif/releases',
  },
  {
    fichier: 'Inter-Variable.woff2',
    nom: 'Inter (variable)',
    licence: 'SIL OFL 1.1',
    url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/InterVariable.woff2',
    secours: 'https://github.com/rsms/inter/releases',
  },
];

/** Un woff2 valide commence par la signature ASCII « wOF2 ». */
function estWoff2(octets) {
  return (
    octets.length > 1024 &&
    octets[0] === 0x77 && octets[1] === 0x4f && octets[2] === 0x46 && octets[3] === 0x32
  );
}

async function recuperer(police) {
  process.stdout.write(`  ${police.nom}… `);
  let reponse;
  try {
    reponse = await fetch(police.url, { redirect: 'follow' });
  } catch (erreur) {
    console.log(`échec réseau (${erreur.message})`);
    return false;
  }
  if (!reponse.ok) {
    console.log(`HTTP ${reponse.status}`);
    return false;
  }

  const octets = new Uint8Array(await reponse.arrayBuffer());
  // Sans ce contrôle, une page d'erreur HTML serait écrite sous un nom .woff2
  // et la police échouerait silencieusement au chargement.
  if (!estWoff2(octets)) {
    console.log('contenu invalide (ce n’est pas un woff2)');
    return false;
  }

  await writeFile(join(ICI, police.fichier), octets);
  console.log(`ok — ${(octets.length / 1024).toFixed(0)} Ko, ${police.licence}`);
  return true;
}

await mkdir(ICI, { recursive: true });
console.log('Récupération des polices du référentiel Style VAL :');

const resultats = await Promise.all(POLICES.map(recuperer));
const echecs = POLICES.filter((_, i) => !resultats[i]);

if (echecs.length === 0) {
  console.log('\nTerminé. Les deux polices sont en place.');
  process.exit(0);
}

console.log('\nCes polices n’ont pas pu être récupérées automatiquement :');
for (const p of echecs) {
  console.log(`  · ${p.nom} → télécharger depuis ${p.secours}`);
  console.log(`    puis renommer en ${p.fichier} dans doc/design/fonts/`);
}
console.log(
  '\nLa page reste parfaitement lisible sans elles : la pile de repli système\n' +
    '(Charter, Sitka Text, Cambria, Georgia / system-ui) prend le relais.\n' +
    'Sortie en succès : l’absence de police web n’est pas une erreur de build.',
);
process.exit(0);
