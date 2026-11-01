// Prepara la cartella www/ che Capacitor inserisce nell'app Android.
// - copia index.html e styles.css
// - unisce src/app.js e le sue dipendenze in un solo www/app.js (esbuild); le icone SVG entrano come testo
// - copia il font, così l'app funziona anche senza connessione
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
cpSync(join(root, 'node_modules/@fontsource-variable/roboto-flex/files/roboto-flex-latin-full-normal.woff2'), join(out, 'fonts/roboto-flex.woff2'));

await build({
  entryPoints: [join(root, 'src/app.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome90'],
  loader: { '.svg': 'text' },
  outfile: join(out, 'app.js'),
  logLevel: 'info',
});
