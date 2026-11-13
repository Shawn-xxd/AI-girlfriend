const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Railway accepts cache mounts only. Keep Cloud's CA injection outside its Dockerfile.
function cloudDockerfile(source) {
  if (/^RUN\s+(?:--|\[)/m.test(source))
    throw new Error(
      'Cloud image renderer requires ordinary shell RUN instructions.',
    );
  return source.replace(
    /^RUN (.+)$/gm,
    'RUN --mount=type=secret,id=proxy_ca,required=true NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca $1',
  );
}
function build() {
  const root = path.resolve(__dirname, '..');
  const tag = process.argv[2] || 'companion-api:guest-acceptance';
  if (!/^[a-z0-9][a-z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(tag))
    throw new Error('Invalid image tag.');
  const ca = process.env.CODEX_PROXY_CERT || process.env.NODE_EXTRA_CA_CERTS;
  if (!ca || !path.isAbsolute(ca) || !fs.statSync(ca).isFile())
    throw new Error('Cloud CA file is unavailable.');
  const env = { ...process.env };
  for (const key of [
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_TLS',
    'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH',
  ])
    delete env[key];
  const source = fs.readFileSync(
    path.join(root, 'apps/api/Dockerfile'),
    'utf8',
  );
  const result = spawnSync(
    'docker',
    [
      '--host=unix:///var/run/docker.sock',
      'build',
      '--secret',
      `id=proxy_ca,src=${ca}`,
      '--file',
      '-',
      '--tag',
      tag,
      '.',
    ],
    {
      cwd: root,
      env,
      input: cloudDockerfile(source),
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  if (result.error || result.status !== 0)
    throw new Error('Cloud API image build failed.');
}
module.exports = { cloudDockerfile };
if (require.main === module) {
  try {
    build();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
