export type Geometry = {
  /** Normalized crop in source image space (0–1). */
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  /** Quarter-turns clockwise (0–3). */
  rotate90: number;
  /** Level / straighten in degrees. */
  straighten: number;
  /** When true, crop resize keeps lockedAspect (width / height in source pixels). */
  aspectLocked: boolean;
  lockedAspect: number;
};

export const DEFAULT_GEOMETRY: Geometry = {
  cropX: 0,
  cropY: 0,
  cropW: 1,
  cropH: 1,
  rotate90: 0,
  straighten: 0,
  aspectLocked: false,
  lockedAspect: 1,
};

const MIN_CROP = 0.05;

export function cloneGeometry(g: Geometry): Geometry {
  return { ...g };
}

export function geometryEqual(a: Geometry, b: Geometry): boolean {
  return (
    a.cropX === b.cropX &&
    a.cropY === b.cropY &&
    a.cropW === b.cropW &&
    a.cropH === b.cropH &&
    a.rotate90 === b.rotate90 &&
    a.straighten === b.straighten &&
    a.aspectLocked === b.aspectLocked &&
    a.lockedAspect === b.lockedAspect
  );
}

export function isDefaultGeometry(g: Geometry): boolean {
  return geometryEqual(g, DEFAULT_GEOMETRY);
}

export function normalizeGeometry(g: Geometry): Geometry {
  let {
    cropX,
    cropY,
    cropW,
    cropH,
    rotate90,
    straighten,
    aspectLocked,
    lockedAspect,
  } = g;
  cropW = Math.max(MIN_CROP, Math.min(1, cropW));
  cropH = Math.max(MIN_CROP, Math.min(1, cropH));
  cropX = Math.max(0, Math.min(1 - cropW, cropX));
  cropY = Math.max(0, Math.min(1 - cropH, cropY));
  rotate90 = ((rotate90 % 4) + 4) % 4;
  straighten = Math.max(-15, Math.min(15, straighten));
  lockedAspect = Math.max(0.05, lockedAspect);
  return {
    cropX,
    cropY,
    cropW,
    cropH,
    rotate90,
    straighten,
    aspectLocked: !!aspectLocked,
    lockedAspect,
  };
}

/** Width / height of the crop in source pixels. */
export function cropPixelAspect(
  g: Geometry,
  srcW: number,
  srcH: number,
): number {
  return (g.cropW * srcW) / Math.max(g.cropH * srcH, 1e-6);
}

/** cropW / cropH in normalized coords for a given pixel aspect ratio. */
export function normCropRatio(
  pixelAspect: number,
  srcW: number,
  srcH: number,
): number {
  return (pixelAspect * srcH) / srcW;
}

/** Apply aspect lock after a crop resize drag. */
export function constrainCropAspect(
  start: Geometry,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  mode: string,
  srcW: number,
  srcH: number,
): Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH"> {
  if (!start.aspectLocked || mode === "move") {
    return { cropX, cropY, cropW, cropH };
  }

  const ratio = normCropRatio(start.lockedAspect, srcW, srcH);
  const anchorEast = !mode.includes("w");
  const anchorSouth = !mode.includes("n");

  if (mode.includes("e") || mode.includes("w")) {
    cropH = cropW / ratio;
    if (!anchorSouth) cropY = start.cropY + start.cropH - cropH;
  } else if (mode.includes("n") || mode.includes("s")) {
    cropW = cropH * ratio;
    if (!anchorEast) cropX = start.cropX + start.cropW - cropW;
  } else {
    cropH = cropW / ratio;
    if (!anchorSouth) cropY = start.cropY + start.cropH - cropH;
    if (!anchorEast) cropX = start.cropX + start.cropW - cropW;
  }

  return { cropX, cropY, cropW, cropH };
}

/** Largest axis-aligned source crop that stays fully visible when leveled. */
export function getMaxSourceCropForRotation(
  srcW: number,
  srcH: number,
  angleRad: number,
): Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH"> {
  if (Math.abs(angleRad) < 1e-8) {
    return { cropX: 0, cropY: 0, cropW: 1, cropH: 1 };
  }
  const { width, height } = getInscribedRotatedSize(srcW, srcH, angleRad);
  const cropW = width / srcW;
  const cropH = height / srcH;
  return {
    cropX: (1 - cropW) / 2,
    cropY: (1 - cropH) / 2,
    cropW,
    cropH,
  };
}

/** Keep crop inside the region that remains visible after level / rotation. */
export function clampCropForRotation(
  g: Geometry,
  srcW: number,
  srcH: number,
): Geometry {
  const max = getMaxSourceCropForRotation(srcW, srcH, rotationRadians(g));
  let cropW = Math.min(g.cropW, max.cropW);
  let cropH = Math.min(g.cropH, max.cropH);
  const cropX = Math.max(
    max.cropX,
    Math.min(g.cropX, max.cropX + max.cropW - cropW),
  );
  const cropY = Math.max(
    max.cropY,
    Math.min(g.cropY, max.cropY + max.cropH - cropH),
  );
  return normalizeGeometry({ ...g, cropX, cropY, cropW, cropH });
}

type OutputUV = { u: number; v: number };

/** Clip a polygon in output-UV space to the visible [0, 1] preview. */
export function clipOutputUVPolygon(points: OutputUV[]): OutputUV[] {
  if (points.length === 0) return points;

  const inside = (p: OutputUV, edge: number) => {
    switch (edge) {
      case 0:
        return p.u >= 0;
      case 1:
        return p.u <= 1;
      case 2:
        return p.v >= 0;
      default:
        return p.v <= 1;
    }
  };

  const intersect = (a: OutputUV, b: OutputUV, edge: number): OutputUV => {
    const du = b.u - a.u;
    const dv = b.v - a.v;
    switch (edge) {
      case 0: {
        const t = (0 - a.u) / du;
        return { u: 0, v: a.v + t * dv };
      }
      case 1: {
        const t = (1 - a.u) / du;
        return { u: 1, v: a.v + t * dv };
      }
      case 2: {
        const t = (0 - a.v) / dv;
        return { u: a.u + t * du, v: 0 };
      }
      default: {
        const t = (1 - a.v) / dv;
        return { u: a.u + t * du, v: 1 };
      }
    }
  };

  let out = points;
  for (let edge = 0; edge < 4; edge++) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]!;
      const prev = input[(i + input.length - 1) % input.length]!;
      const curIn = inside(cur, edge);
      const prevIn = inside(prev, edge);
      if (curIn) {
        if (!prevIn) out.push(intersect(prev, cur, edge));
        out.push(cur);
      } else if (prevIn) {
        out.push(intersect(prev, cur, edge));
      }
    }
  }
  return out;
}

/** Radians applied in the shader (negated so CW UI matches on-screen canvas coords). */
export function rotationRadians(g: Geometry): number {
  return -(
    (g.rotate90 * Math.PI) / 2 + (g.straighten * Math.PI) / 180
  );
}

/**
 * Largest axis-aligned rectangle inside a crop rotated by |angleRad|.
 * Used to auto-crop black corners after level / rotation.
 */
export function getInscribedRotatedSize(
  cropW: number,
  cropH: number,
  angleRad: number,
): { width: number; height: number } {
  const a = Math.abs(angleRad);
  if (a < 1e-8) {
    return { width: cropW, height: cropH };
  }

  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));

  // Multiples of 90° — rotated rect exactly fills the AABB.
  if (c < 1e-6 || s < 1e-6) {
    return {
      width: Math.max(1, cropW * c + cropH * s),
      height: Math.max(1, cropW * s + cropH * c),
    };
  }

  let w = cropW;
  let h = cropH;
  let swapped = false;
  if (h > w) {
    [w, h] = [h, w];
    swapped = true;
  }

  const t = h / w;
  let iw: number;
  let ih: number;

  if (s / c <= t) {
    iw = w * c - h * s;
    ih = h * c - w * s;
  } else {
    ih = (w * s + h * c) / (1 + w / h);
    iw = ih * (w / h);
  }

  iw = Math.max(1, iw);
  ih = Math.max(1, ih);

  if (swapped) {
    return { width: ih, height: iw };
  }
  return { width: iw, height: ih };
}

/** Inscribed output size for the full source image (crop preview). */
export function getFullRotatedPreviewSize(
  srcW: number,
  srcH: number,
  g: Geometry,
): { width: number; height: number } {
  return getInscribedRotatedSize(srcW, srcH, rotationRadians(g));
}

/** Source norm (x,y from visual top) → output UV in inscribed preview. */
export function sourceNormToOutputUV(
  nx: number,
  ny: number,
  srcW: number,
  srcH: number,
  angleRad: number,
): { u: number; v: number } {
  const out = getInscribedRotatedSize(srcW, srcH, angleRad);
  const lx = nx * srcW;
  const ly = (1 - ny) * srcH;
  const dx = lx - srcW / 2;
  const dy = ly - srcH / 2;
  const ca = Math.cos(-angleRad);
  const sa = Math.sin(-angleRad);
  const px = ca * dx + sa * dy;
  const py = -sa * dx + ca * dy;
  return {
    u: px / out.width + 0.5,
    v: py / out.height + 0.5,
  };
}

/** Output UV in inscribed preview → source norm (x,y from visual top). */
export function outputUVToSourceNorm(
  u: number,
  v: number,
  srcW: number,
  srcH: number,
  angleRad: number,
): { x: number; y: number } {
  const out = getInscribedRotatedSize(srcW, srcH, angleRad);
  const px = (u - 0.5) * out.width;
  const py = (v - 0.5) * out.height;
  const ca = Math.cos(-angleRad);
  const sa = Math.sin(-angleRad);
  const dx = ca * px - sa * py;
  const dy = sa * px + ca * py;
  const lx = dx + srcW / 2;
  const ly = dy + srcH / 2;
  return {
    x: lx / srcW,
    y: 1 - ly / srcH,
  };
}

/** Output UV (WebGL: v=0 bottom, v=1 top) → screen coords (y down). */
export function outputUVToScreen(
  u: number,
  v: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  return { x: u * viewW, y: (1 - v) * viewH };
}

/** Screen coords (y down) → output UV (WebGL: v=0 bottom, v=1 top). */
export function screenToOutputUV(
  sx: number,
  sy: number,
  viewW: number,
  viewH: number,
): { u: number; v: number } {
  return { u: sx / viewW, v: 1 - sy / viewH };
}

/** Screen coords (y down) → source norm (y from visual top). */
export function screenToSourceNorm(
  sx: number,
  sy: number,
  srcW: number,
  srcH: number,
  angleRad: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const { u, v } = screenToOutputUV(sx, sy, viewW, viewH);
  return outputUVToSourceNorm(u, v, srcW, srcH, angleRad);
}

/** Source norm → screen coords in letterboxed preview frame. */
export function sourceNormToScreen(
  nx: number,
  ny: number,
  srcW: number,
  srcH: number,
  angleRad: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const { u, v } = sourceNormToOutputUV(nx, ny, srcW, srcH, angleRad);
  return outputUVToScreen(u, v, viewW, viewH);
}

export type OutputRect = {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
};

export type ScreenRect = { x: number; y: number; w: number; h: number };

export function clampOutputRect(rect: OutputRect): OutputRect {
  const minU = Math.max(0, Math.min(1, rect.minU));
  const maxU = Math.max(0, Math.min(1, rect.maxU));
  const minV = Math.max(0, Math.min(1, rect.minV));
  const maxV = Math.max(0, Math.min(1, rect.maxV));
  return {
    minU: Math.min(minU, maxU),
    maxU: Math.max(minU, maxU),
    minV: Math.min(minV, maxV),
    maxV: Math.max(minV, maxV),
  };
}

/** Keep a screen crop rect inside the preview frame. */
export function clampScreenRect(
  rect: ScreenRect,
  viewW: number,
  viewH: number,
): ScreenRect {
  let { x, y, w, h } = rect;
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > viewW) w = viewW - x;
  if (y + h > viewH) h = viewH - y;
  w = Math.max(1, w);
  h = Math.max(1, h);
  return { x, y, w, h };
}

/** Move a crop rect inside the frame without changing its size. */
export function clampScreenRectPosition(
  rect: ScreenRect,
  viewW: number,
  viewH: number,
): ScreenRect {
  const w = Math.min(rect.w, viewW);
  const h = Math.min(rect.h, viewH);
  return {
    x: Math.max(0, Math.min(viewW - w, rect.x)),
    y: Math.max(0, Math.min(viewH - h, rect.y)),
    w,
    h,
  };
}

/** Clamp source crop to image bounds while preserving locked pixel aspect. */
export function clampSourceCropInBoundsPreserveAspect(
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  lockedAspect: number,
  srcW: number,
  srcH: number,
  mode: string,
): Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH"> {
  const ratio = normCropRatio(lockedAspect, srcW, srcH);
  const anchorEast = !mode.includes("w");
  const anchorSouth = !mode.includes("n");

  let w = Math.max(MIN_CROP, cropW);
  let h = w / ratio;

  let x = anchorEast ? cropX : cropX + cropW - w;
  let y = anchorSouth ? cropY : cropY + cropH - h;

  const maxWFromAnchor = anchorEast ? 1 - x : x + cropW;
  const maxHFromAnchor = anchorSouth ? 1 - y : y + cropH;
  let maxW = Math.min(maxWFromAnchor, maxHFromAnchor * ratio, 1);
  let maxH = maxW / ratio;
  if (maxH > 1) {
    maxH = 1;
    maxW = maxH * ratio;
  }

  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }

  if (!anchorEast) x = cropX + cropW - w;
  else x = cropX;
  if (!anchorSouth) y = cropY + cropH - h;
  else y = cropY;

  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;
  if (x < 0) x = 0;
  if (y < 0) y = 0;

  if (x + w > 1) {
    w = 1 - x;
    h = w / ratio;
  }
  if (y + h > 1) {
    h = 1 - y;
    w = h * ratio;
  }

  w = Math.max(MIN_CROP, Math.min(1, w));
  h = Math.max(MIN_CROP, Math.min(1, h));
  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;

  if (!anchorEast) x = Math.max(0, cropX + cropW - w);
  else x = Math.max(0, Math.min(x, 1 - w));
  if (!anchorSouth) y = Math.max(0, cropY + cropH - h);
  else y = Math.max(0, Math.min(y, 1 - h));

  return { cropX: x, cropY: y, cropW: w, cropH: h };
}

/** Scale a screen rect when the preview frame resizes. */
export function scaleScreenRect(
  rect: ScreenRect,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): ScreenRect {
  if (fromW < 1 || fromH < 1) return rect;
  const sx = toW / fromW;
  const sy = toH / fromH;
  return {
    x: rect.x * sx,
    y: rect.y * sy,
    w: rect.w * sx,
    h: rect.h * sy,
  };
}

function sourceCropCornerNorms(
  g: Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH">,
): Array<{ x: number; y: number }> {
  const { cropX, cropY, cropW, cropH } = g;
  return [
    { x: cropX, y: cropY },
    { x: cropX + cropW, y: cropY },
    { x: cropX + cropW, y: cropY + cropH },
    { x: cropX, y: cropY + cropH },
  ];
}

/** Axis-aligned crop bounds in output UV (matches upright overlay). */
export function sourceCropToOutputRect(
  g: Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH">,
  srcW: number,
  srcH: number,
  angleRad: number,
): OutputRect {
  const uv = sourceCropCornerNorms(g).map(({ x, y }) =>
    sourceNormToOutputUV(x, y, srcW, srcH, angleRad),
  );
  return {
    minU: Math.min(...uv.map((p) => p.u)),
    maxU: Math.max(...uv.map((p) => p.u)),
    minV: Math.min(...uv.map((p) => p.v)),
    maxV: Math.max(...uv.map((p) => p.v)),
  };
}

export function outputRectToScreenRect(
  rect: OutputRect,
  viewW: number,
  viewH: number,
): ScreenRect {
  return {
    x: rect.minU * viewW,
    y: (1 - rect.maxV) * viewH,
    w: (rect.maxU - rect.minU) * viewW,
    h: (rect.maxV - rect.minV) * viewH,
  };
}

export function sourceCropToScreenRect(
  g: Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH">,
  srcW: number,
  srcH: number,
  angleRad: number,
  viewW: number,
  viewH: number,
): ScreenRect {
  return outputRectToScreenRect(
    clampOutputRect(sourceCropToOutputRect(g, srcW, srcH, angleRad)),
    viewW,
    viewH,
  );
}

export function outputRectToSourceCrop(
  rect: OutputRect,
  srcW: number,
  srcH: number,
  angleRad: number,
): Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH"> {
  const corners = [
    { u: rect.minU, v: rect.minV },
    { u: rect.maxU, v: rect.minV },
    { u: rect.maxU, v: rect.maxV },
    { u: rect.minU, v: rect.maxV },
  ];
  const source = corners.map(({ u, v }) =>
    outputUVToSourceNorm(u, v, srcW, srcH, angleRad),
  );
  const xs = source.map((p) => p.x);
  const ys = source.map((p) => p.y);
  const cropX = Math.min(...xs);
  const cropY = Math.min(...ys);
  return {
    cropX,
    cropY,
    cropW: Math.max(...xs) - cropX,
    cropH: Math.max(...ys) - cropY,
  };
}

/** Keep the upright crop frame fixed while level / rotation changes. */
export function preserveCropAcrossRotation(
  prev: Geometry,
  next: Geometry,
  srcW: number,
  srcH: number,
): Geometry {
  const oldAngle = rotationRadians(prev);
  const newAngle = rotationRadians(next);
  if (Math.abs(oldAngle - newAngle) < 1e-8) return next;

  const outputRect = sourceCropToOutputRect(prev, srcW, srcH, oldAngle);
  return {
    ...next,
    ...outputRectToSourceCrop(outputRect, srcW, srcH, newAngle),
  };
}

/** Keep on-screen crop pixel size fixed while level / rotation changes in crop mode. */
export function preserveCropScreenRectAcrossRotation(
  next: Geometry,
  screenRect: ScreenRect,
  srcW: number,
  srcH: number,
  frameW: number,
  frameH: number,
): Geometry {
  return {
    ...next,
    ...screenRectToSourceCrop(
      screenRect,
      srcW,
      srcH,
      rotationRadians(next),
      frameW,
      frameH,
    ),
  };
}

export function screenRectToOutputRect(
  rect: ScreenRect,
  viewW: number,
  viewH: number,
): OutputRect {
  return {
    minU: rect.x / viewW,
    maxU: (rect.x + rect.w) / viewW,
    minV: 1 - (rect.y + rect.h) / viewH,
    maxV: 1 - rect.y / viewH,
  };
}

export function screenRectToSourceCrop(
  rect: ScreenRect,
  srcW: number,
  srcH: number,
  angleRad: number,
  viewW: number,
  viewH: number,
): Pick<Geometry, "cropX" | "cropY" | "cropW" | "cropH"> {
  return outputRectToSourceCrop(
    screenRectToOutputRect(rect, viewW, viewH),
    srcW,
    srcH,
    angleRad,
  );
}

/** Largest output rect with target aspect that fits inside an inscribed crop. */
function fitAspectInInscribed(
  inscribed: { width: number; height: number },
  aspect: number,
): { width: number; height: number } {
  const inscribedAspect = inscribed.width / inscribed.height;
  if (aspect >= inscribedAspect) {
    return {
      width: inscribed.width,
      height: inscribed.width / aspect,
    };
  }
  return {
    width: inscribed.height * aspect,
    height: inscribed.height,
  };
}

/** Width / height of the full source image in output space (accounts for quarter-turns). */
export function fullFramePhotoAspect(
  srcW: number,
  srcH: number,
  g: Geometry,
): number {
  const quarterTurns = ((g.rotate90 % 4) + 4) % 4;
  return quarterTurns % 2 === 1 ? srcH / srcW : srcW / srcH;
}

/** Pixel size of the rendered / exported frame after crop + rotation. */
export function getOutputSize(
  srcW: number,
  srcH: number,
  g: Geometry,
): { width: number; height: number } {
  const cropW = Math.max(1, g.cropW * srcW);
  const cropH = Math.max(1, g.cropH * srcH);
  const inscribed = getInscribedRotatedSize(cropW, cropH, rotationRadians(g));

  if (g.aspectLocked) {
    return fitAspectInInscribed(inscribed, g.lockedAspect);
  }
  if (g.cropW >= 0.999 && g.cropH >= 0.999) {
    // Quarter-turn with no level: show the full rotated frame.
    if (Math.abs(g.straighten) < 1e-6) {
      return inscribed;
    }
    // Level only: keep photo aspect (including swap after 90° / 270° turns).
    return fitAspectInInscribed(
      inscribed,
      fullFramePhotoAspect(srcW, srcH, g),
    );
  }
  return inscribed;
}

export function rotate90CW(g: Geometry): Geometry {
  return normalizeGeometry({ ...g, rotate90: g.rotate90 + 1 });
}

export function rotate90CCW(g: Geometry): Geometry {
  return normalizeGeometry({ ...g, rotate90: g.rotate90 - 1 });
}

/** Set crop to a centered window with the given aspect ratio (w/h). */
export function cropToAspect(
  srcW: number,
  srcH: number,
  aspect: number,
  g: Geometry,
): Geometry {
  const srcAspect = srcW / srcH;
  let cropW = 1;
  let cropH = 1;
  if (aspect >= srcAspect) {
    cropH = srcAspect / aspect;
    cropW = 1;
  } else {
    cropW = aspect / srcAspect;
    cropH = 1;
  }
  cropW = Math.max(MIN_CROP, Math.min(1, cropW));
  cropH = Math.max(MIN_CROP, Math.min(1, cropH));
  return normalizeGeometry({
    ...g,
    cropX: (1 - cropW) / 2,
    cropY: (1 - cropH) / 2,
    cropW,
    cropH,
    aspectLocked: true,
    lockedAspect: aspect,
  });
}

export function migrateGeometry(
  partial?: Partial<Geometry> | null,
): Geometry {
  if (!partial) return cloneGeometry(DEFAULT_GEOMETRY);
  return normalizeGeometry({ ...DEFAULT_GEOMETRY, ...partial });
}
