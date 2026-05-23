import { zipSync } from "fflate";
import { Adjustments } from "./adjustments";
import { getOutputSize } from "./geometry";
import { Pipeline, DecodedImage } from "./pipeline";

// Render the image at its full native resolution to a Blob.
export async function exportImage(
  image: DecodedImage,
  adj: Adjustments,
  mime: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92,
): Promise<Blob> {
  const { width, height } = getOutputSize(
    image.width,
    image.height,
    adj.geometry,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const pipeline = new Pipeline(canvas);
  pipeline.setImage(image);
  pipeline.setSize(width, height);
  pipeline.render(adj);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mime,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Keep the blob URL alive briefly so the browser can start each download.
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve();
    }, 400);
  });
}

export async function downloadZip(
  entries: Record<string, Uint8Array>,
  filename: string,
): Promise<void> {
  const zipped = zipSync(entries);
  await downloadBlob(new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" }), filename);
}

function uniqueFilename(base: string, used: Set<string>): string {
  let name = base;
  let n = 2;
  while (used.has(name)) {
    name = base.replace(/(\.[^.]+)$/, `-${n}$1`);
    n++;
  }
  used.add(name);
  return name;
}

export { uniqueFilename };
