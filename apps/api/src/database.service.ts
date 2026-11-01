import { Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { parseConfig } from './config';
import { migrations } from '../../../supabase/migrations/manifest';

@Injectable()
export class DatabaseService {
  readonly client: SupabaseClient<Database>;
  constructor() {
    const config = parseConfig(process.env);
    const timedFetch: typeof fetch = (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      });
    this.client = createClient<Database>(
      config.SUPABASE_URL,
      config.SUPABASE_SECRET_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: timedFetch },
      },
    );
  }
  async checkReadiness(): Promise<void> {
    const latest = migrations.at(-1);
    if (!latest) throw new Error('Database migration manifest missing');
    const { data, error } = await this.client
      .from('companion_schema_migrations')
      .select('version,checksum')
      .eq('version', latest.version)
      .maybeSingle();
    if (error || !data || data.checksum !== latest.sha256)
      throw new Error('Database migration not ready');
  }
}
