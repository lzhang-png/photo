import {
  clampScreenRect,
  clampScreenRectPosition,
  getOutputSize,
  rotationRadians,
  scaleScreenRect,
  screenRectToSourceCrop,
  sourceCropToScreenRect,
  type Geometry,
  type ScreenRect,
} from "./geometry";
import { fitImageInBox, type ImageFrame } from "./viewLayout";

type RenderFn = () => void;
type OverlayFn = (rect: ScreenRect | null) => void;

type Session = {
  active: boolean;
  imageW: number;
  imageH: number;
  live: Geometry;
  screenRect: ScreenRect | null;
  frame: ImageFrame | null;
  prevFrameW: number;
  prevFrameH: number;
};

const session: Session = {
  active: false,
  imageW: 0,
  imageH: 0,
  live: { cropX: 0, cropY: 0, cropW: 1, cropH: 1, rotate90: 0, straighten: 0, aspectLocked: false, lockedAspect: 1 },
  screenRect: null,
  frame: null,
  prevFrameW: 0,
  prevFrameH: 0,
};

let renderFn: RenderFn | null = null;
let overlayFn: OverlayFn | null = null;
let renderRaf = 0;
let overlayRaf = 0;

export function registerTransformRender(fn: RenderFn | null) {
  renderFn = fn;
}

export function registerCropOverlaySync(fn: OverlayFn | null) {
  overlayFn = fn;
}

export function scheduleTransformRender() {
  if (!renderFn) return;
  if (renderRaf) return;
  renderRaf = requestAnimationFrame(() => {
    renderRaf = 0;
    renderFn?.();
  });
}

function scheduleOverlaySync() {
  if (!overlayFn) return;
  if (overlayRaf) return;
  overlayRaf = requestAnimationFrame(() => {
    overlayRaf = 0;
    overlayFn?.(session.screenRect);
  });
}

export function isTransformSessionActive() {
  return session.active;
}

export function getLiveGeometry(fallback: Geometry): Geometry {
  return session.active ? session.live : fallback;
}

export function getCropScreenRect() {
  return session.screenRect;
}

export function getSessionFrame() {
  return session.frame;
}

function fitRect(rect: ScreenRect, geom: Geometry, dw: number, dh: number) {
  return geom.aspectLocked
    ? clampScreenRectPosition(rect, dw, dh)
    : clampScreenRect(rect, dw, dh);
}

function screenRectFromGeometry(
  geom: Geometry,
  srcW: number,
  srcH: number,
  frame: ImageFrame,
): ScreenRect {
  return fitRect(
    sourceCropToScreenRect(
      geom,
      srcW,
      srcH,
      rotationRadians(geom),
      frame.dw,
      frame.dh,
    ),
    geom,
    frame.dw,
    frame.dh,
  );
}

export function getSessionRenderGeometry(fallback: Geometry): Geometry {
  if (!session.active || !session.screenRect || !session.frame) {
    return session.active ? session.live : fallback;
  }
  const crop = screenRectToSourceCrop(
    session.screenRect,
    session.imageW,
    session.imageH,
    rotationRadians(session.live),
    session.frame.dw,
    session.frame.dh,
  );
  return { ...session.live, ...crop };
}

export function computePreviewFrame(
  viewportW: number,
  viewportH: number,
  srcW: number,
  srcH: number,
  geom: Geometry,
): ImageFrame {
  const frameSize = getOutputSize(srcW, srcH, geom);
  return fitImageInBox(viewportW, viewportH, frameSize.width, frameSize.height);
}

export function beginTransformSession(
  geom: Geometry,
  srcW: number,
  srcH: number,
  frame: ImageFrame,
) {
  session.active = true;
  session.imageW = srcW;
  session.imageH = srcH;
  session.live = { ...geom };
  session.frame = frame;
  session.prevFrameW = frame.dw;
  session.prevFrameH = frame.dh;
  session.screenRect = screenRectFromGeometry(geom, srcW, srcH, frame);
  scheduleOverlaySync();
  scheduleTransformRender();
}

export function endTransformSession() {
  session.active = false;
  session.screenRect = null;
  session.frame = null;
  scheduleOverlaySync();
}

export function reloadTransformSession(geom: Geometry) {
  if (!session.active) return;
  session.live = { ...geom };
  session.screenRect = null;
  scheduleTransformRender();
}

export function syncSessionAfterFrame(frame: ImageFrame, geom: Geometry) {
  if (!session.active) return;

  const frameResized =
    session.frame &&
    (session.frame.dw !== frame.dw || session.frame.dh !== frame.dh);

  if (session.screenRect && frameResized && session.prevFrameW > 0 && session.prevFrameH > 0) {
    session.screenRect = session.live.aspectLocked
      ? clampScreenRectPosition(session.screenRect, frame.dw, frame.dh)
      : fitRect(
          scaleScreenRect(
            session.screenRect,
            session.prevFrameW,
            session.prevFrameH,
            frame.dw,
            frame.dh,
          ),
          session.live,
          frame.dw,
          frame.dh,
        );
  }

  if (!session.screenRect) {
    session.screenRect = screenRectFromGeometry(
      geom,
      session.imageW,
      session.imageH,
      frame,
    );
    scheduleOverlaySync();
  }

  session.frame = frame;
  session.prevFrameW = frame.dw;
  session.prevFrameH = frame.dh;
}

export function setSessionStraighten(straighten: number) {
  if (!session.active) return;
  session.live = { ...session.live, straighten };
  // Keep the on-screen crop frame fixed while leveling with aspect locked.
  if (!session.live.aspectLocked) {
    session.screenRect = null;
  }
  scheduleTransformRender();
}

export function setSessionScreenRect(rect: ScreenRect) {
  if (!session.active || !session.frame) return;
  const { dw, dh } = session.frame;
  session.screenRect = fitRect(rect, session.live, dw, dh);
  scheduleOverlaySync();
  scheduleTransformRender();
}

/** Commit screen crop + live rotation to source geometry. */
export function commitTransformSession(): Geometry {
  if (!session.active || !session.screenRect || !session.frame) {
    return session.live;
  }
  const { dw, dh } = session.frame;
  const crop = screenRectToSourceCrop(
    session.screenRect,
    session.imageW,
    session.imageH,
    rotationRadians(session.live),
    dw,
    dh,
  );
  return { ...session.live, ...crop };
}
