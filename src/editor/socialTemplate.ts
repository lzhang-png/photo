import type { Adjustments } from "./adjustments";
import { getOutputSize } from "./geometry";
import { Pipeline, type DecodedImage } from "./pipeline";
import { fitImageFillWidth, fitImageInBox, type ImageFrame } from "./viewLayout";

/** Modern phone portrait (9:19.5). */
export const PHONE_PORTRAIT_ASPECT = 9 / 19.5;

export const SOCIAL_TEMPLATE_EXPORT_WIDTH = 1080;

export type SocialTemplateBackground = "white" | "black";

export type SocialTemplate = {
  enabled: boolean;
  background: SocialTemplateBackground;
};

export const DEFAULT_SOCIAL_TEMPLATE: SocialTemplate = {
  enabled: false,
  background: "black",
};

export function normalizeSocialTemplate(
  partial?: Partial<SocialTemplate> | null,
): SocialTemplate {
  if (!partial) return { ...DEFAULT_SOCIAL_TEMPLATE };
  return {
    enabled: !!partial.enabled,
    background: partial.background === "white" ? "white" : "black",
  };
}

export function cloneSocialTemplate(t: SocialTemplate): SocialTemplate {
  return normalizeSocialTemplate(t);
}

export function getSocialTemplatePixelSize(
  width = SOCIAL_TEMPLATE_EXPORT_WIDTH,
): { width: number; height: number } {
  return {
    width,
    height: Math.max(1, Math.round(width / PHONE_PORTRAIT_ASPECT)),
  };
}

export type SocialTemplateLayout = {
  template: ImageFrame;
  photo: ImageFrame;
};

/** Letterbox a phone frame in the viewport; photo fills template width. */
export function layoutSocialTemplatePreview(
  viewportW: number,
  viewportH: number,
  photoW: number,
  photoH: number,
): SocialTemplateLayout {
  const { width: tw, height: th } = getSocialTemplatePixelSize(
    Math.max(1, viewportW),
  );
  const template = fitImageInBox(viewportW, viewportH, tw, th);
  const photoLocal = fitImageFillWidth(template.dw, template.dh, photoW, photoH);
  return {
    template,
    photo: {
      ox: template.ox + photoLocal.ox,
      oy: template.oy + photoLocal.oy,
      dw: photoLocal.dw,
      dh: photoLocal.dh,
    },
  };
}

export function socialTemplateBackgroundCss(
  background: SocialTemplateBackground,
): string {
  return background === "white" ? "#ffffff" : "#000000";
}

export async function exportSocialTemplateImage(
  image: DecodedImage,
  adj: Adjustments,
  template: SocialTemplate,
  mime: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92,
): Promise<Blob> {
  const photoSize = getOutputSize(
    image.width,
    image.height,
    adj.geometry,
  );
  const photoCanvas = document.createElement("canvas");
  photoCanvas.width = photoSize.width;
  photoCanvas.height = photoSize.height;

  const pipeline = new Pipeline(photoCanvas);
  pipeline.setImage(image);
  pipeline.setSize(photoSize.width, photoSize.height);
  pipeline.render(adj);

  const { width: tw, height: th } = getSocialTemplatePixelSize();
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  ctx.fillStyle = socialTemplateBackgroundCss(template.background);
  ctx.fillRect(0, 0, tw, th);

  const photoFrame = fitImageFillWidth(tw, th, photoSize.width, photoSize.height);
  ctx.drawImage(
    photoCanvas,
    photoFrame.ox,
    photoFrame.oy,
    photoFrame.dw,
    photoFrame.dh,
  );

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mime,
      quality,
    );
  });
}

export async function shareSocialTemplateImage(
  blob: Blob,
  filename: string,
): Promise<"shared" | "unsupported"> {
  if (!navigator.share) return "unsupported";
  const file = new File([blob], filename, { type: blob.type });
  const payload = { files: [file] };
  if (navigator.canShare && !navigator.canShare(payload)) {
    return "unsupported";
  }
  await navigator.share(payload);
  return "shared";
}
