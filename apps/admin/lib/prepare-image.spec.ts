import { expect, it, jest } from '@jest/globals';
import {
  prepareImage,
  MAX_SOURCE_BYTES,
  type ImageProcessor,
} from './prepare-image';
const MB = 1024 * 1024;
function fixture(width: number, height: number, outputBytes = 200_000) {
  const close = jest.fn();
  const encode = jest.fn<ImageProcessor['encode']>(
    async () => new Blob([new Uint8Array(outputBytes)], { type: 'image/webp' }),
  );
  const decode = jest.fn<ImageProcessor['decode']>(async () => ({
    width,
    height,
    source: {} as CanvasImageSource,
    close,
  }));
  return { processor: { decode, encode }, close, encode, decode };
}
function file(bytes: number, type = 'image/jpeg') {
  return new File([new Uint8Array(bytes)], 'portrait.jpg', { type });
}
it('resizes a large portrait proportionally, passes WebP bytes and MIME, and releases decoded image', async () => {
  const f = fixture(4000, 5000);
  const output = await prepareImage(file(10 * MB), f.processor);
  expect(f.encode).toHaveBeenCalledWith(expect.anything(), 1638, 2048);
  expect(output.type).toBe('image/webp');
  expect(output.name).toBe('portrait.webp');
  expect(output.size).toBe(200_000);
  expect(f.close).toHaveBeenCalledTimes(1);
});
it('keeps small suitable originals without recompression or enlargement', async () => {
  const f = fixture(600, 750);
  const original = file(100_000, 'image/png');
  expect(await prepareImage(original, f.processor)).toBe(original);
  expect(f.encode).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledTimes(1);
});
it('keeps the original when encoding would increase storage without changing dimensions', async () => {
  const f = fixture(1200, 1500, 800_000);
  const original = file(600_000);
  expect(await prepareImage(original, f.processor)).toBe(original);
});
it('does not retain an oversized-resolution original even if encoding is larger', async () => {
  const f = fixture(3000, 4000, 800_000);
  const original = file(600_000);
  expect(await prepareImage(original, f.processor)).not.toBe(original);
  expect(f.encode).toHaveBeenCalledWith(expect.anything(), 1536, 2048);
});
it('rejects unsupported, empty and excessively large inputs before decoding', async () => {
  const f = fixture(100, 100);
  for (const input of [
    file(20, 'image/gif'),
    file(0),
    file(MAX_SOURCE_BYTES + 1),
  ]) {
    await expect(prepareImage(input, f.processor)).rejects.toThrow();
  }
  expect(f.decode).not.toHaveBeenCalled();
});
it('rejects invalid dimensions and output too large for the existing bucket contract', async () => {
  const huge = fixture(10000, 10000);
  await expect(prepareImage(file(MB), huge.processor)).rejects.toThrow('像素');
  expect(huge.encode).not.toHaveBeenCalled();
  expect(huge.close).toHaveBeenCalledTimes(1);
  const heavy = fixture(4000, 5000, 9 * MB);
  await expect(prepareImage(file(10 * MB), heavy.processor)).rejects.toThrow(
    '8 MB',
  );
  expect(heavy.close).toHaveBeenCalledTimes(1);
});
it('releases resources on encoder failure and rejects unsupported fallback encodings', async () => {
  const f = fixture(3000, 4000);
  f.encode.mockRejectedValueOnce(new Error('encode failed'));
  await expect(prepareImage(file(MB), f.processor)).rejects.toThrow(
    'encode failed',
  );
  expect(f.close).toHaveBeenCalledTimes(1);
  f.encode.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
  await expect(prepareImage(file(MB), f.processor)).rejects.toThrow('处理失败');
});
