import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildId, precacheList, renderServiceWorker } from '../../build/pwaPlugin.js';

const template = readFileSync(new URL('../../build/sw.template.js', import.meta.url), 'utf8');

describe('plugin PWA', () => {
  it('précache la page et chaque fichier, sans le service worker, dans un ordre stable', () => {
    expect(precacheList(['b.js', 'sw.js', 'a.css'])).toEqual(['./', 'a.css', 'b.js']);
  });

  it('l’identifiant de build change dès qu’un contenu change, et seulement alors', () => {
    const a = buildId([['x.js', 'un']]);
    expect(buildId([['x.js', 'un']])).toBe(a);
    expect(buildId([['x.js', 'deux']])).not.toBe(a);
    expect(buildId([['y.js', 'un']])).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{10}$/);
  });

  it('le gabarit rendu n’a plus de marqueur et liste les fichiers', () => {
    const out = renderServiceWorker(
      template,
      ['assets/app-1.js', 'manifest.webmanifest'],
      'abc123',
    );
    expect(out).not.toContain('__BUILD_ID__');
    expect(out).not.toContain('__PRECACHE__');
    expect(out).toContain("const BUILD_ID = 'abc123'");
    expect(out).toContain('"assets/app-1.js"');
    expect(() => new Function(out)).not.toThrow(); // syntaxe valide
  });

  it('le worker supprime les anciens caches et ne touche pas aux requêtes d’autres origines', () => {
    expect(template).toContain('caches.delete');
    expect(template).toContain('self.location.origin');
  });
});
