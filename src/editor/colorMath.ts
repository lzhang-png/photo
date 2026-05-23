/**
 * Color-space math used to feed uniforms to the GPU pipeline.
 *
 * The temperature/tint sliders are mapped to a Bradford chromatic adaptation
 * matrix in linear sRGB. The matrix is precomputed once per render and
 * uploaded as a `mat3` uniform, so all light math in the fragment shader can
 * operate on a white-balanced linear image without any extra ops per pixel.
 */

// sRGB (D65) → CIE XYZ (D65)
const M_RGB_TO_XYZ = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.0721750,
  0.0193339, 0.1191920, 0.9503041,
];

// CIE XYZ → Bradford LMS
const M_XYZ_TO_LMS = [
   0.8951000,  0.2664000, -0.1614000,
  -0.7502000,  1.7135000,  0.0367000,
   0.0389000, -0.0685000,  1.0296000,
];

// Bradford LMS → CIE XYZ
const M_LMS_TO_XYZ = [
   0.9869929, -0.1470543,  0.1599627,
   0.4323053,  0.5183603,  0.0492912,
  -0.0085287,  0.0400428,  0.9684867,
];

// CIE XYZ (D65) → sRGB
const M_XYZ_TO_RGB = [
   3.2404542, -1.5371385, -0.4985314,
  -0.9692660,  1.8760108,  0.0415560,
   0.0556434, -0.2040259,  1.0572252,
];

const IDENTITY3: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mat3Mul(A: number[], B: number[]): number[] {
  const out = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) {
        s += A[i * 3 + k] * B[k * 3 + j];
      }
      out[i * 3 + j] = s;
    }
  }
  return out;
}

/** Pre-baked LMS-of-D65 white once. Saves work in the hot path. */
const M_RGB_TO_LMS = mat3Mul(M_XYZ_TO_LMS, M_RGB_TO_XYZ);
const M_LMS_TO_RGB = mat3Mul(M_XYZ_TO_RGB, M_LMS_TO_XYZ);

/**
 * Build a 3x3 matrix that, applied to a linear sRGB pixel, performs a
 * Bradford chromatic adaptation. The slider conventions match Lightroom:
 *
 * - Positive `temperature` warms the image (boost L, reduce S in Bradford LMS).
 * - Positive `tint` shifts toward magenta. Negative tint shifts toward green.
 *
 * Slider inputs are expected in `[-1, 1]`. The matrix is column-major
 * (ready for `gl.uniformMatrix3fv(loc, false, data)`).
 */
export function wbMatrix(
  temperature: number,
  tint: number,
): Float32Array {
  if (temperature === 0 && tint === 0) {
    return new Float32Array(IDENTITY3);
  }

  // Slider → Bradford LMS gain. The constants were tuned so that
  // ±1.0 produces a strong but still natural-looking WB shift comparable to
  // about ±3000K offset around D65. Tint maps to the M (green/magenta) axis;
  // sign convention follows Lightroom: positive tint = magenta.
  const gL = 1.0 + temperature * 0.5;
  const gM = 1.0 - tint * 0.3;
  const gS = 1.0 - temperature * 0.5;

  // M = M_LMS_TO_RGB * diag(g) * M_RGB_TO_LMS
  // Scale rows of M_RGB_TO_LMS by the gains, then prepend M_LMS_TO_RGB.
  const scaled = [
    M_RGB_TO_LMS[0] * gL, M_RGB_TO_LMS[1] * gL, M_RGB_TO_LMS[2] * gL,
    M_RGB_TO_LMS[3] * gM, M_RGB_TO_LMS[4] * gM, M_RGB_TO_LMS[5] * gM,
    M_RGB_TO_LMS[6] * gS, M_RGB_TO_LMS[7] * gS, M_RGB_TO_LMS[8] * gS,
  ];
  const M = mat3Mul(M_LMS_TO_RGB, scaled);

  // WebGL `mat3` is column-major. M is row-major (M[row*3 + col]); transpose
  // on upload.
  return new Float32Array([
    M[0], M[3], M[6],
    M[1], M[4], M[7],
    M[2], M[5], M[8],
  ]);
}

export const IDENTITY_WB_MATRIX = new Float32Array(IDENTITY3);
