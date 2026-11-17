export function avatarFrame(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  focus = 0.2,
) {
  if (
    ![width, height, imageWidth, imageHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const renderedWidth = imageWidth * scale,
    renderedHeight = imageHeight * scale;
  const y = Number.isFinite(focus) ? Math.max(0, Math.min(1, focus)) : 0.2;
  return {
    width: renderedWidth,
    height: renderedHeight,
    left: (width - renderedWidth) / 2,
    top: (height - renderedHeight) * y || 0,
  };
}
