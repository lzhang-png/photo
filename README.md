# Photo

A React + WebGL photo editor scaffold with a Lightroom-style adjustment panel
and a RAW decode path via [libraw-wasm](https://www.npmjs.com/package/libraw-wasm).

## What works in this scaffold

- Open JPEG / PNG / WebP / AVIF via drag-and-drop or the **Open…** button
- Open RAW (`.cr2`, `.cr3`, `.nef`, `.arw`, `.dng`, `.raf`, `.rw2`, `.orf`, `.pef`, `.srw`, …)
  via libraw-wasm — loaded lazily on first RAW open
- WebGL render pipeline with the following adjustments:
  - **Light**: Exposure (stops), Contrast, Highlights, Shadows, Whites, Blacks
  - **Color**: Temperature, Tint, Vibrance, Saturation
  - **Tone Curve**: 4-point Catmull-Rom curve, drag the anchors
- Export to JPEG at the source image's native resolution

## Project layout

```
src/
  App.tsx                 top bar + layout
  components/
    Viewport.tsx          WebGL canvas + drop target
    Sidebar.tsx           sliders & curve panel
    CurveEditor.tsx       2D curve UI
  editor/
    adjustments.ts        adjustment state shape + slider specs
    curve.ts              Catmull-Rom → 256-entry LUT
    decode.ts             standard + RAW decode entry points
    pipeline.ts           WebGL program, textures, render
    shaders.ts            vertex + fragment GLSL
    export.ts             native-resolution render → Blob
  state/store.ts          zustand editor state
```

## Getting started

```sh
npm install
npm run dev
```

Open the printed localhost URL and drag a photo onto the viewport. The first
time you open a RAW, the browser downloads the libraw WASM module (~1–2 MB);
subsequent opens are instant.

## Known caveats / next steps

- **libraw-wasm API surface**: the import shape in `decode.ts` matches the
  documented API at the time of writing, but versions can shift. If decoding
  errors out, check the runtime exports of `libraw-wasm` and adjust
  `decodeRaw()` and the ambient declaration in `vite-env.d.ts` to match.
- **Pixel precision**: the pipeline runs on 8-bit textures. For real RAW
  workflows you want 16-bit float textures (`OES_texture_half_float` on WebGL1
  or rgba16f on WebGL2) to avoid banding in highlights/shadows recovery.
- **Memory**: very large RAW files (50+ MP) may hit WebGL `MAX_TEXTURE_SIZE`
  on some GPUs (commonly 8192 or 16384). A tiled pipeline is needed for those.
- **Color management**: libraw is configured for sRGB output here. A full
  pipeline would respect the image's ICC profile and run linear-light math
  before display transform.
- **What's missing vs. Lightroom**: HSL panel, lens corrections, local
  adjustments (masks/brushes/gradients), denoise/sharpen, geometry (crop /
  perspective), catalog/DAM, presets, history. Each is a meaningful build.

## License

MIT
