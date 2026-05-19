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

void main() {
  vec2 uv = vec2(v_uv.x, mix(v_uv.y, 1.0 - v_uv.y, u_flipY));
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

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
