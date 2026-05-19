import { Adjustments } from "./adjustments";
import { Pipeline, DecodedImage } from "./pipeline";

// Render the image at its full native resolution to a Blob.
export async function exportImage(
  image: DecodedImage,
  adj: Adjustments,
  mime: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const pipeline = new Pipeline(canvas);
  pipeline.setImage(image);
  pipeline.setSize(image.width, image.height);
  pipeline.render(adj);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      mime,
      quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
