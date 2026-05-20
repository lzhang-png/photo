export const VERT_SRC = /* glsl */ `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FRAG_SRC = /* glsl */ `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_image;
uniform sampler2D u_curve;

uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_temperature;
uniform float u_tint;
uniform float u_vibrance;
uniform float u_saturation;
uniform float u_flipY;
uniform float u_film;

uniform vec4 u_crop;      // x, y, w, h in source UV space
uniform vec2 u_cropSize;  // crop width/height in source pixels
uniform float u_angle;    // rotation radians (CW)
uniform float u_cropPreview; // 1 = full image + dimmed crop guide

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)),
              d / (q.x + e),
              q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 applyFilm(vec3 c, vec2 uv) {
  if (u_film < 0.5) return c;

  float l = luma(c);
  vec3 col = c;

  // Kodak Portra 400 — warm, soft, slightly muted
  if (u_film < 1.5) {
    col.r *= 1.06;
    col.g *= 1.01;
    col.b *= 0.92;
    col = mix(vec3(l), col, 0.9);
    col = (col - 0.5) * 0.9 + 0.52;
    col += 0.035 * (1.0 - smoothstep(0.0, 0.45, l));
    col.g *= 1.0 - 0.06 * smoothstep(0.25, 0.55, l);
    col += (hash21(uv * 1400.0) - 0.5) * 0.012;
    return clamp(col, 0.0, 1.0);
  }

  // Fujifilm Velvia 50 — saturated, contrasty, vivid greens/blues
  if (u_film < 2.5) {
    col = (col - 0.5) * 1.18 + 0.5;
    float lum = luma(col);
    col = mix(vec3(lum), col, 1.38);
    vec3 hsv = rgb2hsv(max(col, 0.0));
    hsv.y = min(hsv.y * 1.05, 1.0);
    col = hsv2rgb(hsv);
    col.g *= 1.08;
    col.b *= 1.05;
    col.r *= 0.98;
    return clamp(col, 0.0, 1.0);
  }

  // Kodak Tri-X 400 — B&W, high contrast, fine grain
  if (u_film < 3.5) {
    float gray = l;
    gray = (gray - 0.5) * 1.28 + 0.5;
    gray = pow(gray, 1.05);
    col = vec3(gray);
    col.r *= 1.02;
    col.b *= 0.96;
    col = mix(col, vec3(luma(col) * 1.04), smoothstep(0.55, 1.0, l));
    col += (hash21(uv * 2200.0) - 0.5) * 0.045;
    return clamp(col, 0.0, 1.0);
  }

  // CineStill 800T — cool shadows, warm highlights (halation-ish)
  col.r *= 1.02;
  col.g *= 0.98;
  col.b *= 1.06;
  float sMask = 1.0 - smoothstep(0.0, 0.42, l);
  float hMask = smoothstep(0.62, 1.0, l);
  col += vec3(-0.03, 0.0, 0.05) * sMask;
  col += vec3(0.08, 0.03, -0.02) * hMask;
  col = mix(vec3(l), col, 1.12);
  col += (hash21(uv * 1600.0) - 0.5) * 0.018;
  return clamp(col, 0.0, 1.0);
}

vec2 mapOutputUV(vec2 uv) {
  if (u_cropPreview > 0.5) {
    return vec2(uv.x, mix(uv.y, 1.0 - uv.y, u_flipY));
  }

  vec2 cropSize = max(u_cropSize, vec2(1.0));
  float c = abs(cos(u_angle));
  float s = abs(sin(u_angle));
  vec2 outSize = vec2(
    cropSize.x * c + cropSize.y * s,
    cropSize.x * s + cropSize.y * c
  );

  vec2 p = (uv - 0.5) * outSize;
  float ca = cos(-u_angle);
  float sa = sin(-u_angle);
  vec2 rot = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
  vec2 local = rot + cropSize * 0.5;
  float inside = step(0.0, local.x) * step(local.x, cropSize.x) *
                 step(0.0, local.y) * step(local.y, cropSize.y);
  if (inside < 0.5) {
    return vec2(-1.0);
  }
  vec2 texUV = u_crop.xy + (local / cropSize) * u_crop.zw;
  return vec2(texUV.x, mix(texUV.y, 1.0 - texUV.y, u_flipY));
}

void main() {
  vec2 uv = mapOutputUV(v_uv);

  if (u_cropPreview > 0.5) {
    vec2 srcUV = uv;
    vec3 c = texture2D(u_image, srcUV).rgb;
    vec2 local = (srcUV - u_crop.xy) / max(u_crop.zw, vec2(0.0001));
    float inside = step(0.0, local.x) * step(local.x, 1.0) *
                   step(0.0, local.y) * step(local.y, 1.0);
    c *= mix(0.35, 1.0, inside);
    gl_FragColor = vec4(c, 1.0);
    return;
  }

  if (uv.x < 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 c = texture2D(u_image, uv).rgb;

  // White balance: simple temperature (R/B shift) + tint (G shift)
  c.r *= 1.0 + u_temperature * 0.5;
  c.b *= 1.0 - u_temperature * 0.5;
  c.g *= 1.0 + u_tint * 0.4;

  // Exposure (in stops)
  c *= pow(2.0, u_exposure);

  // Tonal region adjustments based on luminance
  float l = luma(c);

  // Highlights / shadows (soft falloff)
  float hMask = smoothstep(0.5, 1.0, l);
  float sMask = 1.0 - smoothstep(0.0, 0.5, l);
  c *= 1.0 + u_highlights * 0.6 * hMask;
  c *= 1.0 + u_shadows * 0.6 * sMask;

  // Whites / blacks (clip-point lifts)
  float wMask = smoothstep(0.7, 1.0, l);
  float bMask = 1.0 - smoothstep(0.0, 0.3, l);
  c += u_whites * 0.25 * wMask;
  c -= u_blacks * 0.25 * bMask;

  // Contrast around 0.5 (linear)
  c = (c - 0.5) * (1.0 + u_contrast) + 0.5;

  // Saturation
  float lum = luma(c);
  c = mix(vec3(lum), c, 1.0 + u_saturation);

  // Vibrance (saturate less-saturated pixels more)
  vec3 hsv = rgb2hsv(max(c, 0.0));
  float vibBoost = u_vibrance * (1.0 - hsv.y);
  hsv.y = clamp(hsv.y + vibBoost, 0.0, 1.0);
  c = hsv2rgb(hsv);

  // Tone curve via 1D LUT (sampled per channel)
  c = clamp(c, 0.0, 1.0);
  c.r = texture2D(u_curve, vec2(c.r, 0.5)).r;
  c.g = texture2D(u_curve, vec2(c.g, 0.5)).r;
  c.b = texture2D(u_curve, vec2(c.b, 0.5)).r;

  c = applyFilm(c, uv);

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
