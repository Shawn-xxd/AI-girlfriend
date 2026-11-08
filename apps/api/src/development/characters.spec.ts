import {
  assertDevelopmentSeedTarget,
  developmentProjectUrl,
} from './characters';
describe('development catalog boundary', () => {
  it('refuses staging, production, missing configuration or another project', () => {
    for (const [url, environment] of [
      [undefined, undefined],
      ['https://another.supabase.co', 'development'],
      [developmentProjectUrl, 'production'],
      [developmentProjectUrl, 'staging'],
    ])
      expect(() => assertDevelopmentSeedTarget(url, environment)).toThrow(
        'designated development',
      );
    expect(() =>
      assertDevelopmentSeedTarget(developmentProjectUrl, 'development'),
    ).not.toThrow();
  });
});
