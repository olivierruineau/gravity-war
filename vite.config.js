import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './', // build relatif : déployable n'importe où (itch.io, GitHub Pages…)
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600, // Phaser pèse ~1.2 Mo, c'est attendu
  },
  server: { open: false },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node', // la logique testée est pure : aucun import de Phaser dans les tests
    testTimeout: 20000, // 20 s au lieu de 5 s pour absorbed les ralentissements CPU en CI
    isolate: false,     // Évite de spawner 60 processus Node séparés sur un runner 2 vCPU
  },
});
