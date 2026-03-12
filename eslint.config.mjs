import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        vscode: 'readonly',
      },
    },
    rules: {
      // Possible Problems
      'no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-debugger': 'error',
      'no-constant-binary-expression': 'error',

      // Best Practices
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-caller': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-return-assign': ['error', 'except-parens'],
      'no-self-compare': 'error',
      'no-throw-literal': 'error',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true }],
      'no-useless-return': 'error',

      // Modern JavaScript
      'prefer-const': ['warn', { destructuring: 'all' }],
      'no-var': 'error',
      'prefer-template': 'warn',
      'prefer-promise-reject-errors': 'error',
      'no-duplicate-imports': 'error',
    },
  },
  {
    // Config files use ES module syntax
    files: ['*.mjs'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    // Test files configuration
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    ignores: ['node_modules/'],
  },
  // Disable ESLint rules that conflict with Prettier (must be last)
  prettier,
];
