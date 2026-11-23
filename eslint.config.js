import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'hypot',
          message: 'Utiliser hypot de core/math.js : Math.hypot alloue à chaque appel (7.4).',
        },
      ],
    },
  },
  {
    // La logique pure ne doit jamais dépendre du navigateur ni de Phaser.
    files: ['src/core/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['phaser', '../scenes/*', '../entities/*', '../systems/*'] },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
      // Aléa de simulation : uniquement via core/rng.js (déterminisme, ADR 0002).
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Utiliser core/rng.js (aléa seedé).' },
        {
          object: 'Math',
          property: 'hypot',
          message: 'Utiliser hypot de core/math.js : Math.hypot alloue à chaque appel (7.4).',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js', 'build/pwaPlugin.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/e2e/*.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, sourceType: 'commonjs' },
  },
  {
    // Le service worker tourne hors page : ses globales sont celles d'un worker, pas du navigateur.
    files: ['build/sw.template.js'],
    languageOptions: { globals: globals.serviceworker },
  },
];
