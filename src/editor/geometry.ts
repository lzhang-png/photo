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
};

export const DEFAULT_GEOMETRY: Geometry = {
  cropX: 0,
  cropY: 0,
  cropW: 1,
  cropH: 1,
  rotate90: 0,
  straighten: 0,
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
    a.straighten === b.straighten
  );
}

export function isDefaultGeometry(g: Geometry): boolean {
  return geometryEqual(g, DEFAULT_GEOMETRY);
}

export function normalizeGeometry(g: Geometry): Geometry {
  let { cropX, cropY, cropW, cropH, rotate90, straighten } = g;
  cropW = Math.max(MIN_CROP, Math.min(1, cropW));
  cropH = Math.max(MIN_CROP, Math.min(1, cropH));
  cropX = Math.max(0, Math.min(1 - cropW, cropX));
  cropY = Math.max(0, Math.min(1 - cropH, cropY));
  rotate90 = ((rotate90 % 4) + 4) % 4;
  straighten = Math.max(-15, Math.min(15, straighten));
  return { cropX, cropY, cropW, cropH, rotate90, straighten };
}

/** Radians applied in the shader (negated so CW UI matches on-screen canvas coords). */
export function rotationRadians(g: Geometry): number {
  return -(
    (g.rotate90 * Math.PI) / 2 + (g.straighten * Math.PI) / 180
  );
}

/** Pixel size of the rendered / exported frame after crop + rotation. */
export function getOutputSize(
  srcW: number,
  srcH: number,
  g: Geometry,
): { width: number; height: number } {
  const cropW = Math.max(1, g.cropW * srcW);
  const cropH = Math.max(1, g.cropH * srcH);
  const rad = rotationRadians(g);
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    width: Math.max(1, Math.ceil(cropW * c + cropH * s)),
    height: Math.max(1, Math.ceil(cropW * s + cropH * c)),
  };
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
  });
}

export function migrateGeometry(
  partial?: Partial<Geometry> | null,
): Geometry {
  if (!partial) return cloneGeometry(DEFAULT_GEOMETRY);
  return normalizeGeometry({ ...DEFAULT_GEOMETRY, ...partial });
}
