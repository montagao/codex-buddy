module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  env: {
    browser: true,
    es2023: true
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.config.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off'
  },
  overrides: [
    {
      files: ['*.js'],
      parser: null,
      plugins: [],
      extends: ['eslint:recommended'],
      rules: {
        'no-undef': 'off' // Chrome APIs are injected by the runtime
      }
    }
  ]
};
