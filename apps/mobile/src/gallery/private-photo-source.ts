// Only the signing credential is ephemeral. Object paths change on replacement.
export const privatePhotoCachePrefix = (owner: string, photo: string) =>
  `tempta.private-photo.v1.${encodeURIComponent(owner)}.${encodeURIComponent(photo)}.`;

export function privatePhotoSource(
  owner: string,
  photo: string,
  uri: string,
  storageUrl: string | undefined,
) {
  try {
    const url = new URL(uri);
    const storage = new URL(storageUrl ?? '');
    const prefix = '/storage/v1/object/sign/companion-photos/';
    if (
      !owner ||
      !photo ||
      url.protocol !== 'https:' ||
      url.origin !== storage.origin ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.startsWith(prefix) ||
      url.pathname.length === prefix.length ||
      !url.searchParams.get('token')
    )
      return undefined;
    const identity = new URL(url);
    identity.searchParams.delete('token');
    identity.searchParams.sort();
    return {
      uri,
      cacheKey: privatePhotoCachePrefix(owner, photo) + identity.href,
    };
  } catch {
    return undefined;
  }
}

/** Cache availability never grants permission. Only transient refresh errors allow reuse. */
export function canReusePrivatePhoto(
  opened: boolean,
  owned: boolean,
  available: boolean,
  errorCode?: string,
) {
  return (
    opened && owned && available && (!errorCode || errorCode === 'unavailable')
  );
}
