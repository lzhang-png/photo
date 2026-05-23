export const VERT_SRC = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_curve;

uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform mat3  u_wbMatrix;     // Bradford CAT, sRGB-linear -> sRGB-linear
uniform float u_vibrance;
uniform float u_saturation;
uniform float u_flipY;
uniform float u_film;
uniform float u_inputLinear;  // 1.0 if image texture is already linear (RAW), 0.0 if sRGB-encoded

uniform vec4 u_crop;          // x, y, w, h in source UV space
uniform vec2 u_cropSize;      // crop width/height in source pixels
uniform float u_angle;        // rotation radians (CW)
uniform float u_cropPreview;  // 1 = full image + dimmed crop guide

// ------------------------------------------------------------------
// sRGB <-> linear (piecewise, IEC 61966-2-1)
// ------------------------------------------------------------------
vec3 srgb_to_linear(vec3 c) {
  bvec3 hi = greaterThan(c, vec3(0.04045));
  vec3 lo = c / 12.92;
  vec3 h  = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, h, vec3(hi));
}

vec3 linear_to_srgb(vec3 c) {
  c = max(c, vec3(0.0));
  bvec3 hi = greaterThan(c, vec3(0.0031308));
  vec3 lo = c * 12.92;
  vec3 h  = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, h, vec3(hi));
}

float luma_linear(vec3 c) {
  // Rec.709 luminance in linear light
  return dot(max(c, vec3(0.0)), vec3(0.2126, 0.7152, 0.0722));
}

// ------------------------------------------------------------------
// OKLab (Björn Ottosson) — linear sRGB <-> OKLab
// ------------------------------------------------------------------
vec3 linear_to_oklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  float l_ = sign(l) * pow(abs(l), 1.0 / 3.0);
  float m_ = sign(m) * pow(abs(m), 1.0 / 3.0);
  float s_ = sign(s) * pow(abs(s), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

vec3 oklab_to_linear(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return vec3(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

// ------------------------------------------------------------------
// Film stocks (operate in sRGB display space, applied after encode)
// ------------------------------------------------------------------
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

float lumaSrgb(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 applyFilm(vec3 c, vec2 uv) {
  if (u_film < 0.5) return c;

  float l = lumaSrgb(c);
  vec3 col = c;
  int film = int(u_film + 0.5);

  // 1: Kodak Portra 400 — warm, soft, slightly muted
  if (film == 1) {
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

  // 2: Fujifilm Velvia 50 — saturated, contrasty, vivid greens/blues
  if (film == 2) {
    col = (col - 0.5) * 1.18 + 0.5;
    float lum = lumaSrgb(col);
    col = mix(vec3(lum), col, 1.38);
    vec3 hsv = rgb2hsv(max(col, 0.0));
    hsv.y = min(hsv.y * 1.05, 1.0);
    col = hsv2rgb(hsv);
    col.g *= 1.08;
    col.b *= 1.05;
    col.r *= 0.98;
    return clamp(col, 0.0, 1.0);
  }

  // 3: Kodak Tri-X 400 — B&W, high contrast, fine grain
  if (film == 3) {
    float gray = l;
    gray = (gray - 0.5) * 1.28 + 0.5;
    gray = pow(gray, 1.05);
    col = vec3(gray);
    col.r *= 1.02;
    col.b *= 0.96;
    col = mix(col, vec3(lumaSrgb(col) * 1.04), smoothstep(0.55, 1.0, l));
    col += (hash21(uv * 2200.0) - 0.5) * 0.045;
    return clamp(col, 0.0, 1.0);
  }

  // 4: CineStill 800T — cool shadows, warm highlights (halation-ish)
  if (film == 4) {
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

  // 5: Kodak Gold 200 — warm, golden highlights, saturated reds/yellows
  if (film == 5) {
    col.r *= 1.08;
    col.g *= 1.04;
    col.b *= 0.88;
    float hMask = smoothstep(0.5, 1.0, l);
    col += vec3(0.05, 0.035, -0.02) * hMask;
    vec3 hsv = rgb2hsv(max(col, 0.0));
    hsv.y = min(hsv.y * 1.1, 1.0);
    col = hsv2rgb(hsv);
    col = (col - 0.5) * 0.96 + 0.5;
    col += (hash21(uv * 1500.0) - 0.5) * 0.014;
    return clamp(col, 0.0, 1.0);
  }

  // 6: Kodak Ektar 100 — vivid, fine-grained, strong reds and blues
  if (film == 6) {
    col = (col - 0.5) * 1.12 + 0.5;
    vec3 hsv = rgb2hsv(max(col, 0.0));
    hsv.y = min(hsv.y * 1.28, 1.0);
    col = hsv2rgb(hsv);
    col.r *= 1.05;
    col.b *= 1.04;
    float sMask = 1.0 - smoothstep(0.0, 0.35, l);
    col -= vec3(0.02, 0.015, 0.0) * sMask;
    col += (hash21(uv * 2600.0) - 0.5) * 0.008;
    return clamp(col, 0.0, 1.0);
  }

  // 7: Kodachrome 64 — rich reds, deep blues, slightly cool shadows
  if (film == 7) {
    col = (col - 0.5) * 1.16 + 0.48;
    vec3 hsv = rgb2hsv(max(col, 0.0));
    hsv.y = min(hsv.y * 1.18, 1.0);
    col = hsv2rgb(hsv);
    col.r *= 1.07;
    col.b *= 1.05;
    col.g *= 0.97;
    float sMask = 1.0 - smoothstep(0.0, 0.4, l);
    col += vec3(-0.015, -0.005, 0.025) * sMask;
    col += (hash21(uv * 1800.0) - 0.5) * 0.01;
    return clamp(col, 0.0, 1.0);
  }

  // 8: Fujifilm Pro 400H — pastel, airy, low contrast, slight cyan/green
  if (film == 8) {
    col = (col - 0.5) * 0.82 + 0.54;
    vec3 hsv = rgb2hsv(max(col, 0.0));
    hsv.y = hsv.y * 0.85;
    col = hsv2rgb(hsv);
    col.g *= 1.03;
    col.b *= 1.05;
    col.r *= 0.98;
    float sMask = 1.0 - smoothstep(0.0, 0.45, l);
    col += vec3(0.02, 0.025, 0.03) * sMask;
    col += (hash21(uv * 1300.0) - 0.5) * 0.01;
    return clamp(col, 0.0, 1.0);
  }

  // 9: Lomo — vivid, heavy vignette, cross-processed cyan/magenta
  if (film == 9) {
    col = (col - 0.5) * 1.22 + 0.5;
    vec3 hsv = rgb2hsv(max(col, 0.0));
    hsv.y = min(hsv.y * 1.4, 1.0);
    col = hsv2rgb(hsv);
    float sMask = 1.0 - smoothstep(0.0, 0.4, l);
    float hMask = smoothstep(0.55, 1.0, l);
    col += vec3(0.0, 0.03, -0.02) * hMask;
    col += vec3(0.02, -0.01, 0.04) * sMask;
    vec2 d = uv - 0.5;
    float vig = 1.0 - smoothstep(0.25, 0.78, dot(d, d));
    col *= mix(0.55, 1.0, vig);
    col += (hash21(uv * 2000.0) - 0.5) * 0.018;
    return clamp(col, 0.0, 1.0);
  }

  // 10: Polaroid 600 — faded shadows, warm highlights, soft contrast
  if (film == 10) {
    col = (col - 0.5) * 0.78 + 0.52;
    vec3 hsv = rgb2hsv(max(col, 0.0));
    hsv.y = hsv.y * 0.78;
    col = hsv2rgb(hsv);
    float sMask = 1.0 - smoothstep(0.0, 0.4, l);
    float hMask = smoothstep(0.55, 1.0, l);
    col += vec3(0.06, 0.04, 0.02) * sMask;
    col += vec3(0.04, 0.02, -0.02) * hMask;
    col.b *= 0.96;
    col += (hash21(uv * 1100.0) - 0.5) * 0.018;
    return clamp(col, 0.0, 1.0);
  }

  // 11: Ilford HP5+ — smooth medium-contrast B&W
  if (film == 11) {
    float gray = l;
    gray = (gray - 0.5) * 1.12 + 0.5;
    col = vec3(gray);
    col = mix(col, vec3(lumaSrgb(col)), 1.0);
    col += (hash21(uv * 1700.0) - 0.5) * 0.03;
    return clamp(col, 0.0, 1.0);
  }

  // 12: Fuji Acros 100 — clean fine-grain B&W with deep blacks
  if (film == 12) {
    float gray = l;
    gray = pow(gray, 1.08);
    gray = (gray - 0.5) * 1.18 + 0.48;
    col = vec3(gray);
    col += (hash21(uv * 3000.0) - 0.5) * 0.012;
    return clamp(col, 0.0, 1.0);
  }

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
  vec2 texUV;
  texUV.x = u_crop.x + (local.x / cropSize.x) * u_crop.z;
  // cropY is stored from the visual top; texture v=0 is also the visual top.
  texUV.y = u_crop.y + (1.0 - local.y / cropSize.y) * u_crop.w;
  return texUV;
}

void main() {
  vec2 uv = mapOutputUV(v_uv);

  if (u_cropPreview > 0.5) {
    vec2 srcUV = uv;
    vec3 c = texture(u_image, srcUV).rgb;
    // In crop-preview we want the original encoded sample to dim against —
    // if the input is linear, convert to sRGB for display.
    if (u_inputLinear > 0.5) c = linear_to_srgb(max(c, vec3(0.0)));
    vec2 local = (srcUV - u_crop.xy) / max(u_crop.zw, vec2(0.0001));
    float inside = step(0.0, local.x) * step(local.x, 1.0) *
                   step(0.0, local.y) * step(local.y, 1.0);
    c *= mix(0.35, 1.0, inside);
    fragColor = vec4(c, 1.0);
    return;
  }

  if (uv.x < 0.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // -------- 1. Sample & decode to linear-light sRGB --------
  vec3 sampled = texture(u_image, uv).rgb;
  vec3 c = (u_inputLinear > 0.5) ? sampled : srgb_to_linear(sampled);

  // -------- 2. White balance (Bradford CAT in linear sRGB) --------
  c = u_wbMatrix * c;

  // -------- 3. Exposure (linear-light gain in stops) --------
  c *= pow(2.0, u_exposure);

  // -------- 4. Highlights / shadows on luminance, preserve chroma --------
  float Y = max(luma_linear(c), 1e-5);

  // Highlights: Reinhard-style soft compression above pivot for negative slider,
  // gentle expansion above pivot for positive slider.
  float hPivot = 0.5;
  float over = max(Y - hPivot, 0.0);
  float Yh;
  if (u_highlights < 0.0) {
    float k = -u_highlights * 4.0;
    Yh = Y - over * (1.0 - 1.0 / (1.0 + k * over));
  } else {
    Yh = Y + over * u_highlights * 0.6;
  }

  // Shadows: gamma lift/crush masked to dark range. Symmetric in log-space.
  float sMask = exp(-Yh * 5.0);
  float gamma = exp(-u_shadows * 1.2);
  float Ys = mix(Yh, pow(max(Yh, 1e-5), gamma), sMask);

  c *= Ys / Y;

  // -------- 5. Whites / Blacks: endpoint remap --------
  // Positive whites pushes the white point DOWN (image brightens at top).
  // Positive blacks pushes the black point DOWN (shadows lift toward gray).
  float W = 1.0 - u_whites * 0.5;
  float B = -u_blacks * 0.1;
  c = (c - B) / max(W - B, 1e-4);

  // -------- 6. Contrast: luma-preserving log-space S-curve around 18% gray --------
  float Yc  = max(luma_linear(c), 1e-5);
  float kCon = exp(u_contrast * 0.8);
  float Yc2 = 0.18 * exp2(log2(Yc / 0.18) * kCon);
  c *= Yc2 / Yc;

  // -------- 7. Tone curve via 1D LUT (in sRGB display domain) --------
  vec3 csOut = linear_to_srgb(max(c, 0.0));
  csOut = clamp(csOut, 0.0, 1.0);
  csOut.r = texture(u_curve, vec2(csOut.r, 0.5)).r;
  csOut.g = texture(u_curve, vec2(csOut.g, 0.5)).r;
  csOut.b = texture(u_curve, vec2(csOut.b, 0.5)).r;
  c = srgb_to_linear(csOut);

  // -------- 8. Saturation / Vibrance in OKLab --------
  vec3 lab = linear_to_oklab(c);
  float chroma = length(lab.yz);
  float satFactor = 1.0 + u_saturation;
  float vibFactor = 1.0 + u_vibrance * clamp(1.0 - chroma * 3.0, 0.0, 1.0);
  lab.yz *= satFactor * vibFactor;
  c = oklab_to_linear(lab);

  // -------- 9. Encode to sRGB display --------
  vec3 outSrgb = clamp(linear_to_srgb(max(c, 0.0)), 0.0, 1.0);

  // -------- 10. Film stocks (operate on sRGB display values) --------
  outSrgb = applyFilm(outSrgb, uv);

  fragColor = vec4(outSrgb, 1.0);
}
`;
