module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'boundaries'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'plugin:boundaries/strict',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  settings: {
    'boundaries/elements': [
      { type: 'domain', pattern: 'src/domain/*' },
      { type: 'application', pattern: 'src/application/*' },
      { type: 'infrastructure', pattern: 'src/infrastructure/*' },
      { type: 'agents', pattern: 'src/agents/*' },
      { type: 'interfaces', pattern: 'src/interfaces/*' },
      { type: 'config', pattern: 'src/config/*' },
      { type: 'shared', pattern: 'src/shared/*' },
    ],
    'boundaries/ignore': ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  },
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          // domain: zero outbound imports from other layers
          { from: 'domain', allow: ['shared'] },
          // application: imports domain only
          { from: 'application', allow: ['domain', 'shared'] },
          // infrastructure: imports domain + application
          { from: 'infrastructure', allow: ['domain', 'application', 'config', 'shared'] },
          // agents: orchestration — imports all inner layers
          { from: 'agents', allow: ['domain', 'application', 'infrastructure', 'config', 'shared'] },
          // interfaces: entry points — imports all inner layers
          { from: 'interfaces', allow: ['domain', 'application', 'infrastructure', 'agents', 'config', 'shared'] },
          // config: self-contained
          { from: 'config', allow: ['shared'] },
          // shared: self-contained
          { from: 'shared', allow: [] },
        ],
      },
    ],
  },
};
