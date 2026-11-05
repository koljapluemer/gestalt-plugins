import { defineConfig } from 'oxlint';

/**
 * A plugin's UI imports only the public packages (`@gestalts/sdk`, `@gestalts/kit`, `@gestalts/learning`), external
 * ones and its own files: never another plugin. `mise run check` holds each to that by building it as in a repo of its
 * own (gestalts' `check-plugin-standalone`).
 */
export default defineConfig({
  ignorePatterns: ['**/dist', '**/node_modules', '**/decks'],
  plugins: ['typescript', 'react', 'oxc', 'unicorn'],
  jsPlugins: [{ name: 'react-hooks-js', specifier: 'eslint-plugin-react-hooks' }],
  categories: { correctness: 'error' },
  rules: {
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'warn',
    'react-hooks-js/set-state-in-render': 'error',
    'react-hooks-js/immutability': 'error',
    'react-hooks-js/refs': 'error',
  },
});
