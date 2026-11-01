import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { DatabaseService } from '../src/database.service';
// These admin operations return a link/token directly and do not send emails.
export async function createAuthFixture(
  admin: DatabaseService['client'],
  url: string,
  key: string,
  register: (id: string) => void,
) {
  const email = `integration-${randomUUID()}@example.com`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('Test identity creation failed');
  const id = created.data.user.id;
  register(id);
  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (link.error || !link.data.properties.hashed_token)
    throw new Error('Test session preparation failed');
  const auth = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const verified = await auth.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session)
    throw new Error('Test session verification failed');
  return { id, token: verified.data.session.access_token };
}
