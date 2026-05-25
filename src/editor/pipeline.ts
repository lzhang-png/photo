import { Adjustments } from "./adjustments";
import { wbMatrix } from "./colorMath";
import { buildCurveLUT } from "./curve";
import { FILM_SHADER_INDEX } from "./filmStocks";
import { getOutputSize, rotationRadians } from "./geometry";
import { FRAG_SRC, VERT_SRC } from "./shaders";

/**
 * A decoded image ready for upload.
 *
 * `format` controls the meaning of `pixels`:
 *  - `"srgb8"`     — `Uint8Array | Uint8ClampedArray`, RGBA, sRGB-encoded
 *    8-bit per channel. Path used by JPEG / PNG / WebP / AVIF.
 *  - `"linear16"`  — `Uint16Array`, RGBA, IEEE 754 half-float bits storing
 *    *linear-light* sRGB values. Path used by RAW develop so highlights
 *    above 1.0 are preserved for recovery.
 */
export type DecodedImage = {
  width: number;
  height: number;
  pixels: Uint8Array | Uint8ClampedArray | Uint16Array;
  flipY: boolean;
  format: "srgb8" | "linear16";
};

type GLState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  imageTex: WebGLTexture;
  curveTex: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
  image: DecodedImage | null;
};

export class Pipeline {
  private state: GLState;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) {
      throw new Error(
        "WebGL2 not supported — try a modern Chrome, Firefox, or Safari (16.4+).",
      );
    }

    const program = makeProgram(gl, VERT_SRC, FRAG_SRC);
    gl.useProgram(program);

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const imageTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const curveTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curveTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of [
      "u_image",
      "u_curve",
      "u_exposure",
      "u_contrast",
      "u_highlights",
      "u_shadows",
      "u_whites",
      "u_blacks",
      "u_wbMatrix",
      "u_vibrance",
      "u_saturation",
      "u_definition",
      "u_sharpen",
      "u_luminanceNoise",
      "u_colorNoise",
      "u_filmGrain",
      "u_vintage",
      "u_texelSize",
      "u_flipY",
      "u_film",
      "u_inputLinear",
      "u_crop",
      "u_cropSize",
      "u_angle",
      "u_cropPreview",
    ]) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(uniforms.u_image!, 0);
    gl.uniform1i(uniforms.u_curve!, 1);

    this.state = { gl, program, imageTex, curveTex, uniforms, image: null };
  }

  setImage(image: DecodedImage) {
    const { gl, imageTex } = this.state;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    if (image.format === "linear16") {
      const halves =
        image.pixels instanceof Uint16Array
          ? image.pixels
          : new Uint16Array(
              image.pixels.buffer,
              image.pixels.byteOffset,
              image.pixels.byteLength / 2,
            );
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        image.width,
        image.height,
        0,
        gl.RGBA,
        gl.HALF_FLOAT,
        halves,
      );
    } else {
      const pixels =
        image.pixels instanceof Uint8Array
          ? image.pixels
          : new Uint8Array(
              image.pixels.buffer,
              image.pixels.byteOffset,
              image.pixels.byteLength,
            );
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        image.width,
        image.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
    }
    this.state.image = image;
  }

  clearImage() {
    this.state.image = null;
  }

  // Fit canvas to its CSS container, preserving image aspect.
  fitToContainer(adj?: Adjustments, cropPreview = false) {
    const { gl, image } = this.state;
    const canvas = gl.canvas as HTMLCanvasElement;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!image) {
      const w = Math.max(1, Math.floor(cw * devicePixelRatio));
      const h = Math.max(1, Math.floor(ch * devicePixelRatio));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return;
    }
    const frame =
      adj && !cropPreview
        ? getOutputSize(image.width, image.height, adj.geometry)
        : { width: image.width, height: image.height };
    const scale = Math.min(cw / frame.width, ch / frame.height);
    const tw = Math.max(1, Math.floor(frame.width * scale * devicePixelRatio));
    const th = Math.max(1, Math.floor(frame.height * scale * devicePixelRatio));
    canvas.width = tw;
    canvas.height = th;
    gl.viewport(0, 0, tw, th);
  }

  // Size canvas to explicit pixel dimensions (used for full-res export).
  setSize(width: number, height: number) {
    const { gl } = this.state;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }

  render(adj: Adjustments, cropPreview = false) {
    const { gl, uniforms, curveTex, image } = this.state;
    if (!image) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    const g = adj.geometry;
    const cropSizeX = Math.max(1, g.cropW * image.width);
    const cropSizeY = Math.max(1, g.cropH * image.height);
    gl.uniform4f(
      uniforms.u_crop!,
      g.cropX,
      g.cropY,
      g.cropW,
      g.cropH,
    );
    gl.uniform2f(uniforms.u_cropSize!, cropSizeX, cropSizeY);
    gl.uniform1f(uniforms.u_angle!, rotationRadians(g));
    gl.uniform1f(uniforms.u_cropPreview!, cropPreview ? 1.0 : 0.0);

    // Upload curve LUT as a 256x1 luminance texture.
    const lut = buildCurveLUT(adj.curve);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curveTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      256,
      1,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      lut,
    );

    gl.uniform1f(uniforms.u_exposure!, adj.exposure);
    gl.uniform1f(uniforms.u_contrast!, adj.contrast);
    gl.uniform1f(uniforms.u_highlights!, adj.highlights);
    gl.uniform1f(uniforms.u_shadows!, adj.shadows);
    gl.uniform1f(uniforms.u_whites!, adj.whites);
    gl.uniform1f(uniforms.u_blacks!, adj.blacks);
    gl.uniformMatrix3fv(
      uniforms.u_wbMatrix!,
      false,
      wbMatrix(adj.temperature, adj.tint),
    );
    gl.uniform1f(uniforms.u_vibrance!, adj.vibrance);
    gl.uniform1f(uniforms.u_saturation!, adj.saturation);
    gl.uniform1f(uniforms.u_definition!, adj.definition);
    gl.uniform1f(uniforms.u_sharpen!, adj.sharpen);
    gl.uniform1f(uniforms.u_luminanceNoise!, adj.luminanceNoise);
    gl.uniform1f(uniforms.u_colorNoise!, adj.colorNoise);
    gl.uniform1f(uniforms.u_filmGrain!, adj.filmGrain);
    gl.uniform1f(uniforms.u_vintage!, adj.vintage);
    gl.uniform2f(uniforms.u_texelSize!, 1 / image.width, 1 / image.height);
    gl.uniform1f(uniforms.u_flipY!, image.flipY ? 1.0 : 0.0);
    gl.uniform1f(uniforms.u_film!, FILM_SHADER_INDEX[adj.film]);
    gl.uniform1f(
      uniforms.u_inputLinear!,
      image.format === "linear16" ? 1.0 : 0.0,
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  readPixels(): Uint8Array {
    const { gl } = this.state;
    const canvas = gl.canvas as HTMLCanvasElement;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    return pixels;
  }

  get canvasSize() {
    const canvas = this.state.gl.canvas as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  }
}

function makeProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    throw new Error("Program link failed: " + log);
  }
  return p;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    throw new Error("Shader compile failed: " + log);
  }
  return s;
}
