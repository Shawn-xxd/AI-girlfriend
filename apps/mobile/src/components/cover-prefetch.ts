import { Image } from 'react-native';
import { createCoverPrefetcher } from './cover-prefetch-core';
const cache = createCoverPrefetcher(async (uri) => {
  if (!(await Image.prefetch(uri))) throw new Error('Cover prefetch failed');
});
export const prefetchCovers = cache.warm;
