const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = require('../supabase/migrations/manifest.ts');
process.stdout.write(`DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;\n`);
// Run twice to check migration repeatability, against an isolated Docker test database only.
for (let pass = 0; pass < 2; pass++) {
  for (const entry of manifest.migrations) {
    if (pass === 0 && entry.version === '20261108000100')
      process.stdout.write(
        fs.readFileSync(
          path.join(root, 'tests/sql/level-backfill-setup.sql'),
          'utf8',
        ),
      );
    process.stdout.write(
      fs.readFileSync(
        path.join(root, 'supabase/migrations', entry.file),
        'utf8',
      ),
    );
  }
}
process.stdout.write(
  fs.readFileSync(path.join(root, 'tests/sql/schema-assertions.sql'), 'utf8'),
);

process.stdout.write(
  fs.readFileSync(path.join(root, 'tests/sql/chat-assertions.sql'), 'utf8'),
);

process.stdout.write(
  fs.readFileSync(
    path.join(root, 'tests/sql/provider-usage-assertions.sql'),
    'utf8',
  ),
);
process.stdout.write(
  fs.readFileSync(path.join(root, 'tests/sql/level-assertions.sql'), 'utf8'),
);
