const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveMobileConfig } = require('./build-config.cjs');
const base = require('../app.json').expo;
const fixture = {
  APP_VARIANT: 'preview',
  EAS_BUILD_PROFILE: 'preview',
  EAS_PROJECT_ID: '10000000-0000-4000-8000-000000000001',
  IOS_BUNDLE_IDENTIFIER: 'com.example.companion',
  EXPO_PUBLIC_API_URL: 'https://companion-api.example.com',
  EXPO_PUBLIC_SUPABASE_URL: 'https://dxpiqttvtxjhmlvxstbb.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture',
};
test('local Expo Go remains available without EAS; updates are disabled', () => {
  const result = resolveMobileConfig(base, {});
  assert.equal(result.updates.enabled, false);
  assert.equal(result.extra.eas, undefined);
});
test('device preview is separate from production and uses compatible updates', () => {
  const result = resolveMobileConfig(base, fixture);
  assert.equal(result.ios.bundleIdentifier, 'com.example.companion.preview');
  assert.equal(result.scheme, 'aicompanion-preview');
  assert.equal(result.runtimeVersion.policy, 'fingerprint');
  assert.equal(
    result.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-dev-client',
    )[1].addGeneratedScheme,
    false,
  );
  assert.equal(
    result.updates.url,
    `https://u.expo.dev/${fixture.EAS_PROJECT_ID}`,
  );
});
test('missing configuration fails with variable names, without credential values', () => {
  for (const name of [
    'EAS_PROJECT_ID',
    'IOS_BUNDLE_IDENTIFIER',
    'EXPO_PUBLIC_API_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]) {
    assert.throws(
      () => resolveMobileConfig(base, { ...fixture, [name]: '' }),
      new RegExp(name),
    );
  }
});
test('unknown or mismatched variants cannot silently become production or development', () => {
  assert.throws(
    () => resolveMobileConfig(base, { ...fixture, APP_VARIANT: 'staging' }),
    /APP_VARIANT/,
  );
  assert.throws(
    () =>
      resolveMobileConfig(base, {
        ...fixture,
        EAS_BUILD_PROFILE: 'production',
      }),
    /match/,
  );
});
test('remote builds reject loopback, private network, cleartext, credentialed or malformed API URLs', () => {
  for (const value of [
    'http://localhost:3000',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.1.1',
    'https://172.20.1.1',
    'https://192.168.1.5',
    'https://[::1]',
    'https://[fd00::1]',
    'https://server.internal',
    'https://companion-api.example.com/v1',
    'https://user:password@api.example.com',
    'https://api.example.com?key=value',
  ])
    assert.throws(
      () =>
        resolveMobileConfig(base, { ...fixture, EXPO_PUBLIC_API_URL: value }),
      /HTTPS/,
    );
});
test('a design-only build cannot enter the signed real test channel', () => {
  assert.throws(
    () =>
      resolveMobileConfig(base, {
        ...fixture,
        EXPO_PUBLIC_DISCOVER_PREVIEW: '1',
      }),
    /Design preview/,
  );
  assert.doesNotThrow(() =>
    resolveMobileConfig(base, { EXPO_PUBLIC_DISCOVER_PREVIEW: '1' }),
  );
});
test('server secrets never enter the published Expo config', () => {
  const result = resolveMobileConfig(base, {
    ...fixture,
    SUPABASE_SECRET_KEY: 'server-secret-fixture',
    DEEPSEEK_API_KEY: 'model-key-fixture',
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('server-secret-fixture'), false);
  assert.equal(serialized.includes('model-key-fixture'), false);
  for (const name of [
    'EXPO_PUBLIC_SUPABASE_SECRET_KEY',
    'EXPO_PUBLIC_DEEPSEEK_API_KEY',
    'EXPO_PUBLIC_EXPO_TOKEN',
  ])
    assert.throws(
      () =>
        resolveMobileConfig(base, { ...fixture, [name]: 'private-fixture' }),
      /cannot be public/,
    );
  assert.throws(
    () =>
      resolveMobileConfig(base, {
        ...fixture,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture',
      }),
    /publishable/,
  );
});
test('production rejects development data and requires legal pages', () => {
  const production = {
    ...fixture,
    APP_VARIANT: 'production',
    EAS_BUILD_PROFILE: 'production',
  };
  assert.throws(
    () => resolveMobileConfig(base, production),
    /development Supabase/,
  );
  production.EXPO_PUBLIC_SUPABASE_URL =
    'https://production-project.example.com';
  assert.throws(() => resolveMobileConfig(base, production), /PRIVACY/);
  production.EXPO_PUBLIC_PRIVACY_URL = 'https://company.example.com/privacy';
  assert.throws(() => resolveMobileConfig(base, production), /TERMS/);
  production.EXPO_PUBLIC_TERMS_URL = 'https://company.example.com/terms';
  const result = resolveMobileConfig(base, production);
  assert.equal(result.ios.bundleIdentifier, 'com.example.companion');
  assert.equal(result.name, base.name);
});
test('a stored public project identity allows EAS environment bootstrap and rejects conflicting overrides', () => {
  const stored = {
    ...base,
    ios: { ...base.ios, bundleIdentifier: fixture.IOS_BUNDLE_IDENTIFIER },
    extra: { eas: { projectId: fixture.EAS_PROJECT_ID } },
  };
  assert.equal(
    resolveMobileConfig(stored, {}).extra.eas.projectId,
    fixture.EAS_PROJECT_ID,
  );
  const publicEnv = { ...fixture };
  delete publicEnv.EAS_PROJECT_ID;
  delete publicEnv.IOS_BUNDLE_IDENTIFIER;
  assert.equal(
    resolveMobileConfig(stored, publicEnv).ios.bundleIdentifier,
    'com.example.companion.preview',
  );
  assert.throws(
    () =>
      resolveMobileConfig(stored, {
        ...fixture,
        EAS_PROJECT_ID: '20000000-0000-4000-8000-000000000001',
      }),
    /conflicts/,
  );
  assert.throws(
    () =>
      resolveMobileConfig(stored, {
        ...fixture,
        IOS_BUNDLE_IDENTIFIER: 'com.other.companion',
      }),
    /conflicts/,
  );
});
test('invalid native identities and build-time missing config are rejected before consuming a remote build', () => {
  assert.throws(
    () =>
      resolveMobileConfig(base, { ...fixture, EAS_PROJECT_ID: 'not-a-uuid' }),
    /EAS_PROJECT_ID/,
  );
  assert.throws(
    () =>
      resolveMobileConfig(base, {
        ...fixture,
        IOS_BUNDLE_IDENTIFIER: 'not a bundle id',
      }),
    /IOS_BUNDLE_IDENTIFIER/,
  );
  assert.throws(
    () => resolveMobileConfig(base, { EAS_BUILD: 'true' }),
    /EAS_PROJECT_ID/,
  );
});
test('build profiles keep channels and environments aligned; monorepo shared package is built on EAS', () => {
  const eas = require('../eas.json');
  for (const variant of ['development', 'preview', 'production']) {
    assert.equal(eas.build[variant].channel, variant);
    assert.equal(eas.build[variant].environment, variant);
    assert.equal(eas.build[variant].env.APP_VARIANT, variant);
  }
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.developmentClient, undefined);
  assert.match(
    require('../package.json').scripts['eas-build-post-install'],
    /--filter @companion\/shared build/,
  );
});
