module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['<rootDir>/apps/api/test/**/*.integration.ts'],
  testTimeout: 30000,
};
