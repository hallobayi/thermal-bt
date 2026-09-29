/**
 * Turning pixels into the 1-bit rows `GS v 0` wants.
 *
 * A thermal printer has no grey: every dot is burnt or not. So an image has to be reduced to
 * one bit per dot before it is sent, and the *way* that reduction happens decides whether a
 * logo looks crisp or like a grey smear.
 */

/**
 * Pack boolean dots into the printer's raster format.
 *
 * One bit per dot, most significant bit first, and every row padded out to a whole byte. The
 * padding matters: a 384-dot row is exactly 48 bytes, but a 100-dot row is 13 bytes with four
 * wasted bits, and getting that wrong shears the whole image sideways.
 */
export function packRasterRows(rows: Iterable<Iterable<boolean>>, widthDots: number): Uint8Array {
  // Materialised because the buffer size needs the row count, and consuming a one-shot
  // iterator to count it would leave nothing to pack.
  const materialised = Array.isArray(rows) ? rows : [...rows]

  const bytesPerRow = Math.ceil(widthDots / 8)
  const out = new Uint8Array(bytesPerRow * materialised.length)

  materialised.forEach((row, rowIndex) => {
    const base = rowIndex * bytesPerRow
    let column = 0

    for (const dot of row) {
      if (dot) {
        // `>> 3` picks the byte, `& 7` the bit inside it. MSB first, so bit 7 is the leftmost dot.
        const index = base + (column >> 3)
        out[index] = (out[index] ?? 0) | (0x80 >> (column & 7))
      }
      column++
    }
  })

  return out
}

/**
 * Reduce greyscale to dots by a fixed threshold.
 *
 * Fast, and fine for line art, text screenshots and anything already black-and-white. For
 * photographs this produces large flat black or white areas; use `ditherToBits` instead.
 *
 * @param grey One byte per pixel, 0 = black, 255 = white.
 */
export function thresholdToBits(
  grey: Uint8Array | readonly number[],
  width: number,
  height: number,
  threshold = 128
): boolean[][] {
  const rows: boolean[][] = []

  for (let y = 0; y < height; y++) {
    const row: boolean[] = []
    for (let x = 0; x < width; x++) {
      row.push((grey[y * width + x] ?? 255) < threshold)
    }
    rows.push(row)
  }

  return rows
}

/**
 * Reduce greyscale to dots with Floyd-Steinberg error diffusion.
 *
 * Each pixel's quantisation error is pushed onto its unprocessed neighbours, which is what
 * turns a photograph into something a 1-bit printer can show recognisably. Roughly four times
 * the work of `thresholdToBits`, and worth it for anything with gradients.
 *
 * @param grey One byte per pixel, 0 = black, 255 = white.
 */
export function ditherToBits(
  grey: Uint8Array | readonly number[],
  width: number,
  height: number
): boolean[][] {
  // Float copy: error diffusion accumulates fractional values, and rounding to integers at
  // every step would quantise the error away and produce banding.
  const working = new Float32Array(width * height)
  for (let index = 0; index < working.length; index++) working[index] = grey[index] ?? 255

  const rows: boolean[][] = []

  for (let y = 0; y < height; y++) {
    const row: boolean[] = []
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const value = working[index] ?? 255
      const black = value < 128
      row.push(black)

      const error = value - (black ? 0 : 255)
      distribute(working, width, height, x, y, error)
    }
    rows.push(row)
  }

  return rows
}

function distribute(
  working: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  error: number
): void {
  const right = x + 1
  if (right < width) {
    const index = y * width + right
    working[index] = (working[index] ?? 0) + (error * 7) / 16
  }

  if (y + 1 >= height) return
  const below = (y + 1) * width

  if (x > 0) {
    const index = below + x - 1
    working[index] = (working[index] ?? 0) + (error * 3) / 16
  }
  {
    const index = below + x
    working[index] = (working[index] ?? 0) + (error * 5) / 16
  }
  if (right < width) {
    const index = below + right
    working[index] = (working[index] ?? 0) + (error * 1) / 16
  }
}
