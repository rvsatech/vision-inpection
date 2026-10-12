/** Testes unitários: domínio e casos de uso, sem I/O. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/modules/**/domain/**/*.ts', 'src/modules/**/application/**/*.ts'],
};
