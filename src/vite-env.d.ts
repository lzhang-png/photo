/// <reference types="vite/client" />

declare module "libraw-wasm" {
  interface RawImageData {
    bits: number;
    colors: number;
    data: Uint8Array;
    dataSize: number;
    width: number;
    height: number;
  }

  export default class LibRaw {
    open(buffer: Uint8Array, params?: Record<string, unknown>): Promise<void>;
    imageData(): Promise<RawImageData | Uint8Array>;
    metadata(fullOutput?: boolean): Promise<Record<string, unknown>>;
  }
}
