module.exports = {
  root: true,
  env:  { browser: true, es2020: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react/jsx-runtime'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  rules: {
    'no-unused-vars': 'warn',
    'react/prop-types': 'off',
  },
};
