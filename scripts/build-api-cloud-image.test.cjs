const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cloudDockerfile } = require('./build-api-cloud-image.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'apps/api/Dockerfile'), 'utf8');
test('Railway points to the portable Dockerfile with no unsupported secret mounts', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, 'railway.json'), 'utf8'),
  );
  assert.equal(config.build.dockerfilePath, 'apps/api/Dockerfile');
  assert.equal(source.includes('--mount='), false);
  assert.equal(source.includes('proxy_ca'), false);
  assert.match(source, /npm install --global pnpm@11\.25\.0 --strict-ssl=true/);
});
test('Cloud builds inject temporary CA trust for each shell RUN without changing the Railway file', () => {
  const rendered = cloudDockerfile(source);
  assert.equal(
    (rendered.match(/--mount=type=secret,id=proxy_ca,required=true/g) || [])
      .length,
    (source.match(/^RUN /gm) || []).length,
  );
  assert.equal(
    fs.readFileSync(path.join(root, 'apps/api/Dockerfile'), 'utf8'),
    source,
  );
  assert.equal(
    rendered.split('AS runtime\n')[1],
    source.split('AS runtime\n')[1],
  );
  assert.equal(/^ENV .*NODE_EXTRA_CA_CERTS/m.test(rendered), false);
  assert.equal(/^COPY .*proxy_ca/m.test(rendered), false);
});
test('TLS validation remains enabled in both paths', () => {
  const rendered = cloudDockerfile(source);
  for (const file of [source, rendered]) {
    assert.equal(
      /strict-ssl=false|NODE_TLS_REJECT_UNAUTHORIZED=0|--insecure/.test(file),
      false,
    );
  }
});
test('unsupported RUN forms are rejected rather than silently rendered with different semantics', () => {
  assert.throws(
    () => cloudDockerfile('RUN ["npm","install"]'),
    /ordinary shell/,
  );
  assert.throws(
    () => cloudDockerfile('RUN --mount=type=cache,target=/cache npm install'),
    /ordinary shell/,
  );
});
