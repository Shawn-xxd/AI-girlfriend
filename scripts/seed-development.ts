import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../apps/api/src/database.types';
import {
  assertDevelopmentSeedTarget,
  developmentCharacters,
} from '../apps/api/src/development/characters';
import { migrations } from '../supabase/migrations/manifest';
config({ quiet: true });
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply'))
    throw new Error('Usage: pnpm seed:development [--apply]');
  assertDevelopmentSeedTarget(process.env.SUPABASE_URL, process.env.NODE_ENV);
  if (!args.includes('--apply')) {
    console.log(
      JSON.stringify(
        {
          mode: 'preview',
          characters: developmentCharacters.map(({ id, name, published }) => ({
            id,
            name,
            published,
          })),
          note: 'No database writes. --apply inserts missing development characters and never overwrites existing rows.',
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!process.env.SUPABASE_SECRET_KEY)
    throw new Error('SUPABASE_SECRET_KEY is required');
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
      },
    },
  );
  const latest = migrations.at(-1)!;
  const ledger = await client
    .from('companion_schema_migrations')
    .select('checksum')
    .eq('version', latest.version)
    .maybeSingle();
  if (ledger.error || ledger.data?.checksum !== latest.sha256)
    throw new Error(
      'Formal development schema is not ready. No character was written.',
    );
  const inserted = await client
    .from('companion_characters')
    .upsert(developmentCharacters, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (inserted.error) throw new Error('Development catalog insert failed');
  const catalog = await client
    .from('companion_characters')
    .select('id', { head: true, count: 'exact' })
    .eq('published', true);
  if (catalog.error) throw new Error('Unable to verify published catalog');
  console.log(
    JSON.stringify({
      mode: 'applied',
      inserted: inserted.data?.length ?? 0,
      publishedCharacters: catalog.count,
      existingRowsOverwritten: false,
    }),
  );
}
main().catch(() => {
  console.error(
    'Development catalog was not completed. Check designated project, schema and server credentials. No credentials are logged.',
  );
  process.exitCode = 1;
});
