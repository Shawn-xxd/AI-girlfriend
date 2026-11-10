module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['<rootDir>/apps/api/test/memory-live.smoke.ts'],
  testTimeout: 180000,
};
