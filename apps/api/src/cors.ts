export function browserOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    return [
      ...new Set(
        value.split(',').map((part) => {
          const url = new URL(part.trim());
          if (
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== '/' ||
            (url.protocol !== 'https:' &&
              !(
                url.protocol === 'http:' &&
                ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
              ))
          )
            throw new Error();
          return url.origin;
        }),
      ),
    ];
  } catch {
    throw new Error('Invalid CORS_ALLOWED_ORIGINS');
  }
}
