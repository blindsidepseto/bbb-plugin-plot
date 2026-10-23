/* eslint-disable @typescript-eslint/no-var-requires */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        module: 'commonjs',
        target: 'es2019',
        esModuleInterop: true,
        resolveJsonModule: true,
        noImplicitAny: true,
        strictNullChecks: true,
        types: ['jest', '@testing-library/jest-dom'],
      },
    }],
  },
  moduleNameMapper: {
    '^plotly\\.js-basic-dist-min$': '<rootDir>/tests/__mocks__/plotly.ts',
  },
};
