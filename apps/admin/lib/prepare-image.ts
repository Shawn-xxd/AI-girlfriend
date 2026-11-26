const MB = 1024 * 1024;
export const MAX_SOURCE_BYTES = 32 * MB;
export const MAX_UPLOAD_BYTES = 8 * MB;
const MAX_EDGE = 2048;
const KEEP_BYTES = 512 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type DecodedImage = {
  width: number;
  height: number;
  source: CanvasImageSource;
  close: () => void;
};
export type ImageProcessor = {
  decode: (file: File) => Promise<DecodedImage>;
  encode: (image: DecodedImage, width: number, height: number) => Promise<Blob>;
};

const browserProcessor: ImageProcessor = {
  async decode(file) {
    // Modern browsers apply EXIF orientation before reporting dimensions/drawing.
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image,
        close: () => {
          image.src = '';
          URL.revokeObjectURL(url);
        },
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('图片无法读取，请重新导出为 JPEG、PNG 或 WebP');
    }
  },
  async encode(image, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法处理图片，请更新浏览器后重试');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image.source, 0, 0, width, height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob?.type === 'image/webp') resolve(blob);
            else
              reject(
                new Error('浏览器不支持 WebP 压缩，请使用最新版 Chrome 后重试'),
              );
          },
          'image/webp',
          0.9,
        );
      });
    } finally {
      canvas.width = canvas.height = 0;
    }
  },
};

export async function prepareImage(
  file: File,
  processor: ImageProcessor = browserProcessor,
): Promise<File> {
  if (!TYPES.includes(file.type))
    throw new Error('请选择 JPEG、PNG 或 WebP 图片');
  if (!file.size || file.size > MAX_SOURCE_BYTES)
    throw new Error('请选择不超过 32 MB 的非空图片');
  const image = await processor.decode(file);
  try {
    const { width, height } = image;
    if (!(width > 0 && height > 0) || width * height > 40_000_000)
      throw new Error('图片像素过大，请先缩小至 4000 万像素以内');
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    if (scale === 1 && file.size <= KEEP_BYTES) return file;
    const blob = await processor.encode(
      image,
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
    if (!blob.size || blob.type !== 'image/webp')
      throw new Error('图片处理失败，请重试');
    // Do not replace an already suitable original with a larger encoded file.
    if (scale === 1 && file.size <= MAX_UPLOAD_BYTES && blob.size >= file.size)
      return file;
    if (blob.size > MAX_UPLOAD_BYTES)
      throw new Error('处理后图片仍超过 8 MB，请先缩小图片后重试');
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } finally {
    image.close();
  }
}

export function imageSize(bytes: number): string {
  return bytes < MB
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / MB).toFixed(1)} MB`;
}
