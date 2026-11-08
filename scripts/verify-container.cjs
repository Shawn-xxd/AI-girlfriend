'use strict';
const { config } = require('dotenv');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
config({ quiet: true });
async function main() {
  if (
    process.env.SUPABASE_URL !== 'https://dxpiqttvtxjhmlvxstbb.supabase.co' ||
    !process.env.SUPABASE_SECRET_KEY
  )
    throw new Error(
      'Container verification requires the designated development project.',
    );
  const env = { ...process.env };
  for (const key of [
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_TLS',
    'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH',
  ])
    delete env[key];
  const docker = (args) =>
    execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-container-'));
  const file = path.join(dir, 'server.env');
  const name = `companion-acceptance-${process.pid}`;
  let running = false;
  try {
    const values = {
      NODE_ENV: 'production',
      PORT: '3000',
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    };
    for (const value of Object.values(values))
      if (/[\r\n]/.test(value))
        throw new Error('Invalid environment configuration');
    fs.writeFileSync(
      file,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n',
      { mode: 0o600 },
    );
    const ca =
      process.env.CODEX_PROXY_CERT ||
      process.env.NODE_EXTRA_CA_CERTS ||
      '/etc/ssl/certs/ca-certificates.crt';
    docker([
      'run',
      '--detach',
      '--name',
      name,
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=16m',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--env-file',
      file,
      '--mount',
      `type=bind,src=${ca},dst=/run/proxy-ca.pem,readonly`,
      '-e',
      'NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem',
      '-p',
      '127.0.0.1::3000',
      'companion-api:guest-acceptance',
    ]);
    running = true;
    const mapping = docker(['port', name, '3000/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(mapping))
      throw new Error('Unexpected container port mapping');
    const base = `http://${mapping}`;
    let live = false;
    for (let i = 0; i < 40; i++) {
      try {
        live = (
          await globalThis.fetch(base + '/v1/health/live', {
            signal: globalThis.AbortSignal.timeout(1000),
          })
        ).ok;
      } catch {
        /* The process may still be starting. */
      }
      if (live) break;
      await delay(250);
    }
    if (!live) throw new Error('Container liveness failed');
    const ready = await globalThis.fetch(base + '/v1/health/ready', {
      signal: globalThis.AbortSignal.timeout(15000),
    });
    if (!ready.ok) throw new Error('Container database readiness failed');
    const protectedResponse = await globalThis.fetch(base + '/v1/characters', {
      signal: globalThis.AbortSignal.timeout(5000),
    });
    if (protectedResponse.status !== 401)
      throw new Error('Unauthenticated API boundary failed');
    const runtime = JSON.parse(
      docker([
        'exec',
        name,
        'node',
        '-e',
        `for(const name of ['typescript','jest','expo']){try{require.resolve(name);process.exit(1)}catch{}}if(process.getuid()===0)process.exit(1);console.log(JSON.stringify({uid:process.getuid(),node:process.versions.node,developmentDependenciesAbsent:true}))`,
      ]),
    );
    console.log(
      JSON.stringify({
        containerPassed: true,
        readOnlyFilesystem: true,
        liveness: 200,
        databaseReadiness: 200,
        unauthenticatedCharacters: 401,
        ...runtime,
      }),
    );
  } finally {
    if (running) docker(['rm', '--force', name]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error &&
      [
        'Container liveness failed',
        'Container database readiness failed',
        'Unauthenticated API boundary failed',
      ].includes(error.message)
      ? error.message
      : 'Container verification did not complete. Inspect build/runtime configuration without logging credentials.',
  );
  process.exitCode = 1;
});
