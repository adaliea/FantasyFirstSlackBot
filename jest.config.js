/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/app.ts'],
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/tests/__mocks__/prismaClient.ts',
  },
};
