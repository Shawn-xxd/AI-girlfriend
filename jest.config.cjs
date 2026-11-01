module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.spec.ts'],
  moduleNameMapper: {
    '^@companion/shared$': '<rootDir>/packages/shared/src/index.ts',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          types: ['node', 'jest'],
        },
      },
    ],
  },
};
