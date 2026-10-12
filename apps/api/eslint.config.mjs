import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'src/generated/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Regra de arquitetura: o domínio não conhece infraestrutura.
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@nestjs/*', '**/infrastructure/**', '**/generated/**', 'ioredis', 'stripe', 'pg'], message: 'A camada de domínio deve ser pura (sem framework/infra).' },
          ],
        },
      ],
    },
  },
);
