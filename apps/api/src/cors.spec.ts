import { describe, expect, it } from '@jest/globals';
import { browserOrigins } from './cors';
describe('explicit preview CORS configuration', () => {
  it('keeps browser access disabled by default and normalizes explicit origins', () => {
    expect(browserOrigins(undefined)).toEqual([]);
    expect(
      browserOrigins(
        'https://preview.example.test, http://localhost:8081,https://preview.example.test/',
      ),
    ).toEqual(['https://preview.example.test', 'http://localhost:8081']);
  });
  it('rejects wildcard origins, credentials, paths and public plaintext origins', () => {
    for (const input of [
      '*',
      'https://user:password@site.test',
      'https://site.test/path',
      'http://site.test',
      'https://site.test?key=secret',
    ])
      expect(() => browserOrigins(input)).toThrow(
        'Invalid CORS_ALLOWED_ORIGINS',
      );
  });
});
