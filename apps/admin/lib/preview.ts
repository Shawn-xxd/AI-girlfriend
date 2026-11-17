import { request } from './client';
import { createPreviewCache } from './preview-cache';
export const previewImages = createPreviewCache((token, path) =>
  request(token, 'preview', { path }),
);
