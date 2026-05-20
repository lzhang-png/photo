import { DEFAULT_RAW_SETTINGS, toLibrawOptions, type RawSettings } from "./rawSettings";

type LibRawCtor = typeof import("libraw-wasm").default;
type LibRawInstance = InstanceType<LibRawCtor>;

let LibRawClass: LibRawCtor | null = null;

export function assertRawDecodeEnvironment(): void {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "RAW decoding needs cross-origin isolation (SharedArrayBuffer). " +
        "Use `npm run dev` or serve the app with COOP/COEP headers.",
    );
  }
}

async function createLibRaw(): Promise<LibRawInstance> {
  assertRawDecodeEnvironment();
  if (!LibRawClass) {
    const mod = await import("libraw-wasm");
    LibRawClass = mod.default;
  }
  return new LibRawClass();
}

export type RawDecodeResult = {
  image: Awaited<ReturnType<LibRawInstance["imageData"]>>;
  meta: Record<string, unknown>;
};

export async function decodeWithLibraw(
  file: File,
  settings: RawSettings = DEFAULT_RAW_SETTINGS,
): Promise<RawDecodeResult> {
  const lr = await createLibRaw();
  const buffer = new Uint8Array(await file.arrayBuffer());

  const tryOpen = async (halfSize: boolean) => {
    await lr.open(buffer, {
      ...toLibrawOptions(settings),
      halfSize,
    });
  };

  try {
    await tryOpen(false);
  } catch (first) {
    try {
      await tryOpen(true);
    } catch {
      throw first;
    }
  }

  const meta = (await lr.metadata(false)) as Record<string, unknown>;
  const image = await lr.imageData();
  return { image, meta };
}
