import { parseConfig } from './config';
const valid = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-only',
};
describe('server configuration', () => {
  it('requires SDK credentials instead of a database password', () => {
    expect(() => parseConfig({})).toThrow('SUPABASE_SECRET_KEY');
    expect(parseConfig(valid).PORT).toBe(3000);
  });
  it('rejects invalid ports without exposing the key', () => {
    expect(() => parseConfig({ ...valid, PORT: 'bad' })).toThrow('PORT');
    expect(() =>
      parseConfig({ ...valid, SUPABASE_URL: 'private-secret' }),
    ).not.toThrow('private-secret');
  });
  it('rejects insecure remote or credential-bearing URLs', () => {
    for (const url of [
      'http://example.com',
      'https://secret:password@example.com',
      'https://example.com/?key=secret',
    ]) {
      expect(() => parseConfig({ ...valid, SUPABASE_URL: url })).toThrow(
        'SUPABASE_URL',
      );
    }
  });
  it('allows HTTP loopback only for isolated integration infrastructure', () => {
    expect(
      parseConfig({ ...valid, SUPABASE_URL: 'http://127.0.0.1:54321' })
        .SUPABASE_URL,
    ).toContain('127.0.0.1');
  });
});

describe('provider configuration boundaries', () => {
  it('defaults to DeepSeek without requiring any OpenAI key', () => {
    const config = parseConfig(valid);
    expect(config.AI_PROVIDER).toBe('deepseek');
    expect(config.MODERATION_PROVIDER).toBe('deepseek');
    expect(config.AI_PROVIDER_API_KEY).toBeUndefined();
  });
  it('rejects unsafe or credential-bearing custom provider URLs', () => {
    for (const url of [
      'http://models.example.test',
      'https://user:secret@models.example.test',
      'https://models.example.test/?key=secret',
    ]) {
      expect(() => parseConfig({ ...valid, AI_BASE_URL: url })).toThrow(
        'AI_BASE_URL',
      );
    }
  });
  it('rejects unknown provider names instead of silently changing vendors', () => {
    expect(() =>
      parseConfig({ ...valid, AI_PROVIDER: 'unrecognized' }),
    ).toThrow('AI_PROVIDER');
  });
});
