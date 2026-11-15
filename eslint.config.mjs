import { completeConfigBase } from 'eslint-config-complete';
import { defineConfig } from 'eslint/config';

import { dialogFocusRules } from './scripts/eslint-rules/dialog-focus.mjs';

export default defineConfig(
    ...completeConfigBase,

    {
        plugins: { homepage: { rules: dialogFocusRules } },
        rules: {
            'homepage/stable-dialog-ref': 'error',
            'homepage/no-invalid-focus-effect': 'error',
        },
    },

    {
        ignores: [
            '.next/**',
            '.vercel/**',
            'dist/**',
            'next-env.d.ts',
            'public/sw.js',
        ],
    },

    {
        files: ['**/*.d.ts'],
        rules: {
            'import-x/no-default-export': 'off',
            'import-x/no-unassigned-import': 'off',
        },
    },

    {
        files: [
            'next.config.ts',
            'playwright.config.ts',
            'src/app/**/{error,layout,loading,not-found,page}.tsx',
            'src/proxy.ts',
        ],
        rules: {
            'import-x/no-default-export': 'off',
        },
    },

    {
        files: ['next.config.ts'],
        rules: {
            '@typescript-eslint/require-await': 'off',
            'complete/no-mutable-return': 'off',
        },
    },

    {
        files: ['src/proxy.ts'],
        rules: {
            'unicorn/prefer-string-raw': 'off',
        },
    },

    {
        rules: {
            '@stylistic/quotes': 'off',
            '@typescript-eslint/consistent-type-definitions': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/strict-boolean-expressions': 'off',
            'n/file-extension-in-import': 'off',
            '@typescript-eslint/restrict-plus-operands': 'off',
            'import-x/no-unassigned-import': [
                'error',
                {
                    allow: ['**/*.css', 'server-only'],
                },
            ],
        },
    }
);
