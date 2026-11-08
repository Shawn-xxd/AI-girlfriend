/** Review-only prices/levels. Never used as a production configuration or entitlement. */
export type GalleryPreviewPhoto = {
  id: string;
  kind: 'level' | 'diamond';
  title: string;
  unlocked: boolean;
  level?: number;
  diamonds?: number;
};
export const galleryPreviewPhotos: GalleryPreviewPhoto[] = [
  {
    id: 'preview-level-1',
    kind: 'level',
    title: 'LEVEL 1',
    unlocked: true,
    level: 1,
  },
  {
    id: 'preview-diamond-1',
    kind: 'diamond',
    title: 'HOT 🔥',
    unlocked: false,
    diamonds: 7,
  },
  {
    id: 'preview-level-2',
    kind: 'level',
    title: 'ROLEPLAY ✨',
    unlocked: false,
    level: 2,
  },
  {
    id: 'preview-diamond-2',
    kind: 'diamond',
    title: 'HOT 🔥',
    unlocked: false,
    diamonds: 7,
  },
];
