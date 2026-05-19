/// <reference types="vite/client" />

declare module "libraw-wasm" {
  export default class LibRaw {
    open(buffer: Uint8Array, params?: Record<string, unknown>): Promise<void>;
    imageData(): Promise<Uint8Array | Uint16Array>;
    metadata(fullOutput?: boolean): Promise<Record<string, unknown>>;
  }
}
