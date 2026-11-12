const path = require('node:path');
require('dotenv').config({
  quiet: true,
  path: [
    path.join(__dirname, '../.env.local'),
    path.join(__dirname, '../.env'),
  ],
});
const { resolveMobileConfig } = require('./build-config.cjs');
const base = require('../app.json').expo;
try {
  const config = resolveMobileConfig(base, {
    ...process.env,
    EAS_BUILD: 'true',
  });
  console.log(
    JSON.stringify({
      deviceConfigurationReady: true,
      variant: config.extra.appVariant,
      bundleIdentifier: config.ios.bundleIdentifier,
      updatesEnabled: config.updates.enabled,
      runtimePolicy: config.runtimeVersion.policy,
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
