// Plugin Vite maison (8.10, ADR 0009) : écrit `sw.js` à partir du gabarit, avec la liste des fichiers du build et un
// identifiant de build. Aucune dépendance : un plugin npm de plus n'apporterait pas grand-chose ici.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TEMPLATE = new URL('./sw.template.js', import.meta.url);

/** Chemins relatifs mis en cache : la page (`./`) et chaque fichier émis, hors le service worker lui-même. */
export function precacheList(fileNames) {
  return ['./', ...fileNames.filter((f) => f !== 'sw.js').sort()];
}

/** Empreinte courte du contenu du build : change dès qu'un fichier change. */
export function buildId(files) {
  const hash = createHash('sha256');
  for (const [name, source] of files) hash.update(name).update(source);
  return hash.digest('hex').slice(0, 10);
}

/** Remplit le gabarit : liste de précache et identifiant de build. */
export function renderServiceWorker(template, fileNames, id) {
  return template
    .replace('__BUILD_ID__', id)
    .replace("'__PRECACHE__'", JSON.stringify(precacheList(fileNames), null, 2));
}

export function pwaPlugin() {
  return {
    name: 'gravity-war-pwa',
    apply: 'build',
    // `public/` est copié après `generateBundle` : on lit ces fichiers directement pour les inclure.
    generateBundle(_options, bundle) {
      const entries = Object.entries(bundle).map(([name, chunk]) => [
        name,
        chunk.type === 'chunk' ? chunk.code : chunk.source,
      ]);
      const names = entries.map(([name]) => name);
      const publicFiles = [
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'icons/apple-touch-icon.png',
      ];
      const id = buildId(entries);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: renderServiceWorker(readFileSync(TEMPLATE, 'utf8'), [...names, ...publicFiles], id),
      });
    },
  };
}
