const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('dotenv');
const { configureLocal } = require('./configure-local.cjs');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-sdk-local-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'apps/mobile'), { recursive: true });
  return dir;
}
test('server Key stays in a private file and never reaches mobile configuration', (t) => {
  const dir = fixture(t);
  configureLocal(dir, 'sb_secret_test-only');
  const env = parse(fs.readFileSync(path.join(dir, '.env')));
  assert.equal(env.SUPABASE_SECRET_KEY, 'sb_secret_test-only');
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(fs.statSync(path.join(dir, '.env')).mode & 0o777, 0o600);
  assert.equal(
    fs.readFileSync(path.join(dir, 'apps/mobile/.env'), 'utf8'),
    'EXPO_PUBLIC_API_URL=http://localhost:3000\n',
  );
});
test('existing server settings are preserved', (t) => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, '.env'), 'KEEP=original\n');
  assert.throws(() => configureLocal(dir, 'test-only'), /已有/);
  assert.equal(
    fs.readFileSync(path.join(dir, '.env'), 'utf8'),
    'KEEP=original\n',
  );
});
test('existing mobile settings are preserved', (t) => {
  const dir = fixture(t);
  const mobile = path.join(dir, 'apps/mobile/.env');
  fs.writeFileSync(mobile, 'KEEP=mobile\n');
  configureLocal(dir, 'test-only');
  assert.equal(fs.readFileSync(mobile, 'utf8'), 'KEEP=mobile\n');
});
test('empty and multiline Keys cannot create settings', (t) => {
  const dir = fixture(t);
  for (const key of ['', 'line1\nline2'])
    assert.throws(() => configureLocal(dir, key));
  assert.equal(fs.existsSync(path.join(dir, '.env')), false);
});
