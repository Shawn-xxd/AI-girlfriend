module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['<rootDir>/apps/api/test/live-ai.smoke.ts'],
  testTimeout: 150000,
};
