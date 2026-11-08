module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['<rootDir>/apps/api/test/guest-live.smoke.ts'],
  testTimeout: 150000,
};
