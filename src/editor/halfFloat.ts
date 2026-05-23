/**
 * IEEE 754 half-precision float <-> 32-bit float conversion.
 *
 * Used to feed linear-light RAW data to a WebGL2 `RGBA16F` texture
 * (`gl.HALF_FLOAT`) and to read those values back for thumbnails / readback.
 *
 * The half format is 1 sign bit, 5 exponent bits, 10 mantissa bits with bias
 * 15 (range ≈ ±65504, smallest positive normal ≈ 6.10e-5).
 */

const F32 = new Float32Array(1);
const U32 = new Uint32Array(F32.buffer);

/**
 * Pack a finite 32-bit float into 16-bit half-float bits.
 *
 * Handles ±0, subnormals, normal numbers, ±Infinity and NaN. The algorithm is
 * the well-known compact form from the Mesa / OpenEXR community.
 */
export function floatToHalf(val: number): number {
  F32[0] = val;
  const x = U32[0];

  const sign = (x >> 16) & 0x8000;
  let mantissa = x & 0x007fffff;
  const exp32 = (x >> 23) & 0xff;

  // ±Infinity, NaN
  if (exp32 === 0xff) {
    return sign | 0x7c00 | (mantissa !== 0 ? 0x0200 : 0);
  }

  // Convert exponent: bias 127 -> bias 15
  let exp16 = exp32 - 127 + 15;

  if (exp16 >= 0x1f) {
    // Overflow → ±Inf
    return sign | 0x7c00;
  }

  if (exp16 <= 0) {
    // Subnormal or underflow
    if (exp16 < -10) {
      return sign;
    }
    mantissa |= 0x00800000;
    const shift = 14 - exp16; // 14..24
    const half = sign | (mantissa >> shift);
    // Round-half-to-even
    if (((mantissa >> (shift - 1)) & 1) !== 0) {
      return half + 1;
    }
    return half;
  }

  // Normal number with round-half-to-even
  const half =
    sign | (exp16 << 10) | (mantissa >> 13);
  if ((mantissa & 0x00001000) !== 0) {
    return half + 1;
  }
  return half;
}

const HALF_F32 = new Float32Array(1);
const HALF_U32 = new Uint32Array(HALF_F32.buffer);

/** Unpack 16-bit half-float bits to a 32-bit float number. */
export function halfToFloat(h: number): number {
  const sign = (h & 0x8000) << 16;
  const exp = (h & 0x7c00) >> 10;
  const mant = h & 0x03ff;

  if (exp === 0) {
    if (mant === 0) {
      HALF_U32[0] = sign;
      return HALF_F32[0];
    }
    // Subnormal: normalize
    let m = mant;
    let e = -14;
    while ((m & 0x0400) === 0) {
      m <<= 1;
      e -= 1;
    }
    m &= 0x03ff;
    HALF_U32[0] = sign | ((e + 127) << 23) | (m << 13);
    return HALF_F32[0];
  }
  if (exp === 0x1f) {
    HALF_U32[0] = sign | 0x7f800000 | (mant << 13);
    return HALF_F32[0];
  }
  HALF_U32[0] = sign | ((exp - 15 + 127) << 23) | (mant << 13);
  return HALF_F32[0];
}

/** Pack a linear-RGBA `Float32Array` into a tightly packed `Uint16Array` of halves. */
export function packHalves(src: Float32Array): Uint16Array {
  const out = new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = floatToHalf(src[i]);
  }
  return out;
}
