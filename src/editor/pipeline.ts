import { Adjustments } from "./adjustments";
import { buildCurveLUT } from "./curve";
import { FRAG_SRC, VERT_SRC } from "./shaders";

export type DecodedImage = {
  width: number;
  height: number;
  pixels: Uint8Array | Uint8ClampedArray; // RGBA
  flipY: boolean;
};

type GLState = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  imageTex: WebGLTexture;
  curveTex: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
  image: DecodedImage | null;
};

export class Pipeline {
  private state: GLState;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL not supported");

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
      "u_temperature",
      "u_tint",
      "u_vibrance",
      "u_saturation",
      "u_flipY",
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
      gl.RGBA,
      image.width,
      image.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    this.state.image = image;
  }

  // Fit canvas to its CSS container, preserving image aspect.
  fitToContainer() {
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
    const scale = Math.min(cw / image.width, ch / image.height);
    const tw = Math.max(1, Math.floor(image.width * scale * devicePixelRatio));
    const th = Math.max(1, Math.floor(image.height * scale * devicePixelRatio));
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

  render(adj: Adjustments) {
    const { gl, uniforms, curveTex, image } = this.state;
    if (!image) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

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
    gl.uniform1f(uniforms.u_temperature!, adj.temperature);
    gl.uniform1f(uniforms.u_tint!, adj.tint);
    gl.uniform1f(uniforms.u_vibrance!, adj.vibrance);
    gl.uniform1f(uniforms.u_saturation!, adj.saturation);
    gl.uniform1f(uniforms.u_flipY!, image.flipY ? 1.0 : 0.0);

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
