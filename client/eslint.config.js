import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'url';
import path from 'path';
import tanstackQueryPlugin from '@tanstack/eslint-plugin-query';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: {},
});

// Import root config
import baseConfig from '../eslint.config.js';

export default [
  ...baseConfig,
  ...compat.extends('plugin:react/recommended', 'plugin:react-hooks/recommended', 'plugin:jsx-a11y/recommended'),
  {
    files: ['**/*.{jsx,tsx,js,ts}'], 
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        document: 'readonly',
        navigator: 'readonly',
        window: 'readonly'
      }
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      '@tanstack/query': tanstackQueryPlugin
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@tanstack/query/exhaustive-deps': 'warn',
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  }
];