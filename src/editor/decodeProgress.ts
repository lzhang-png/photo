export type DecodeProgress = {
  /** Overall progress from 0 to 1. */
  value: number;
  label: string;
};

export type DecodeProgressCallback = (value: number, label?: string) => void;

/** Map per-file progress into a multi-file batch (0–1). */
export function batchDecodeProgress(
  fileIndex: number,
  fileCount: number,
  fileProgress: number,
): number {
  if (fileCount <= 0) return Math.max(0, Math.min(1, fileProgress));
  const slice = 1 / fileCount;
  return Math.min(1, fileIndex * slice + fileProgress * slice);
}

export function createBatchProgressReporter(
  setProgress: (progress: DecodeProgress | null) => void,
  fileIndex: number,
  fileCount: number,
  defaultLabel: string,
): DecodeProgressCallback {
  return (value, label) => {
    setProgress({
      value: batchDecodeProgress(fileIndex, fileCount, value),
      label: label ?? defaultLabel,
    });
  };
}
