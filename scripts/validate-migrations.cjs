const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../supabase/migrations');
const { migrations } = require('../supabase/migrations/manifest.ts');
const versions = new Set();
for (const entry of migrations) {
  if (versions.has(entry.version))
    throw new Error('Duplicate migration version');
  versions.add(entry.version);
  if (path.basename(entry.file) !== entry.file)
    throw new Error('Invalid migration path');
  const sql = fs.readFileSync(path.join(root, entry.file), 'utf8');
  const body = sql
    .split('-- BEGIN MIGRATION BODY\n')[1]
    ?.split('-- END MIGRATION BODY')[0];
  if (!body || createHash('sha256').update(body).digest('hex') !== entry.sha256)
    throw new Error('Migration checksum mismatch');
  if (!sql.includes(`VALUES ('${entry.version}', '${entry.sha256}')`))
    throw new Error('Migration ledger mismatch');
}
console.log(
  `Validated ${migrations.length} SQL migration artifact(s). SQL execution is checked separately.`,
);
