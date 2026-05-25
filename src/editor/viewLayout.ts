/** Letterbox an image with a given aspect into a container box. */
export type ImageFrame = {
  ox: number;
  oy: number;
  dw: number;
  dh: number;
};

export function fitImageInBox(
  boxW: number,
  boxH: number,
  imgW: number,
  imgH: number,
): ImageFrame {
  if (boxW <= 0 || boxH <= 0 || imgW <= 0 || imgH <= 0) {
    return { ox: 0, oy: 0, dw: boxW, dh: boxH };
  }
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const dw = imgW * scale;
  const dh = imgH * scale;
  return {
    ox: (boxW - dw) / 2,
    oy: (boxH - dh) / 2,
    dw,
    dh,
  };
}

/** Scale to fill container width; height follows image aspect (may letterbox vertically). */
export function fitImageFillWidth(
  boxW: number,
  boxH: number,
  imgW: number,
  imgH: number,
): ImageFrame {
  if (boxW <= 0 || boxH <= 0 || imgW <= 0 || imgH <= 0) {
    return { ox: 0, oy: 0, dw: boxW, dh: boxH };
  }
  const scale = boxW / imgW;
  const dw = boxW;
  const dh = imgH * scale;
  return {
    ox: 0,
    oy: (boxH - dh) / 2,
    dw,
    dh,
  };
}
