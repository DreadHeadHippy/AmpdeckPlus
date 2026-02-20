// ESLint flat config format (v9+) - ES Module
export default [
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        DOMParser: 'readonly',
        WebSocket: 'readonly',
        Worker: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        Promise: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        NodeList: 'readonly',
        URLSearchParams: 'readonly',
        connectElgatoStreamDeckSocket: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { 
        vars: 'all', 
        args: 'none',
        varsIgnorePattern: '^_'
      }],
      'no-console': 'off',
      'no-undef': 'error'
    },
    files: ['src/**/*.js']
  }
];
