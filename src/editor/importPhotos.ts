import { decode, isRawFile } from "./decode";
import { createBatchProgressReporter } from "./decodeProgress";
import type { DecodeProgress } from "./decodeProgress";
import type { DecodedImage } from "./pipeline";

type ImportPhotoDeps = {
  addPhoto: (
    image: DecodedImage,
    file: File,
    isRaw: boolean,
    makeActive?: boolean,
  ) => string;
  setStatus: (msg: string | null) => void;
  setDecodeProgress: (progress: DecodeProgress | null) => void;
};

export async function importPhotoFiles(
  files: File[],
  { addPhoto, setStatus, setDecodeProgress }: ImportPhotoDeps,
): Promise<void> {
  if (files.length === 0) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const raw = isRawFile(file);
    const isLast = i === files.length - 1;
    const statusLabel = raw
      ? `Decoding RAW ${file.name} (${i + 1}/${files.length})…`
      : `Decoding ${file.name} (${i + 1}/${files.length})…`;
    setStatus(statusLabel);
    try {
      const decoded = await decode(
        file,
        undefined,
        createBatchProgressReporter(
          setDecodeProgress,
          i,
          files.length,
          statusLabel.replace(/…$/, ""),
        ),
      );
      addPhoto(decoded, file, raw, isLast);
      if (isLast) {
        setStatus(`${decoded.width} × ${decoded.height} · ${files.length} photo(s)`);
      }
    } catch (err) {
      setStatus(`Failed ${file.name}: ${(err as Error).message}`);
      setDecodeProgress(null);
      break;
    }
  }
  setDecodeProgress(null);
}
