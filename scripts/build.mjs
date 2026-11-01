// Prepara la cartella www/ che Capacitor inserisce nell'app Android.
// - copia index.html e styles.css
// - unisce src/app.js e le sue dipendenze in un solo www/app.js (esbuild)
// - copia i font, così l'app funziona anche senza connessione
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

cpSync(join(root, 'src/index.html'), join(out, 'index.html'));
cpSync(join(root, 'src/styles.css'), join(out, 'styles.css'));

const fonts = {
  'gloock/files/gloock-latin-400-normal.woff2': 'gloock-400.woff2',
  'instrument-sans/files/instrument-sans-latin-400-normal.woff2': 'instrument-sans-400.woff2',
  'instrument-sans/files/instrument-sans-latin-500-normal.woff2': 'instrument-sans-500.woff2',
  'instrument-sans/files/instrument-sans-latin-600-normal.woff2': 'instrument-sans-600.woff2',
  'ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2': 'plex-mono-400.woff2',
  'ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2': 'plex-mono-500.woff2',
};
for (const [src, dest] of Object.entries(fonts)) {
  cpSync(join(root, 'node_modules/@fontsource', src), join(out, 'fonts', dest));
}

await build({
  entryPoints: [join(root, 'src/app.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome90'],
  outfile: join(out, 'app.js'),
  logLevel: 'info',
});
