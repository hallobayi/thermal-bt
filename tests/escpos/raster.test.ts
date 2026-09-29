/**
 * Raster packing.
 *
 * The bit order is the whole game here: get it wrong and a logo comes out sheared sideways or
 * with every row shifted one dot. These tests pin the exact bytes.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ditherToBits, packRasterRows, thresholdToBits } from '../../src/escpos/raster.ts'
import { assertBytes } from '../support/bytes.ts'

describe('packRasterRows', () => {
  it('puts the leftmost dot in the most significant bit', () => {
    const packed = packRasterRows([[true, false, false, false, false, false, false, false]], 8)
    assertBytes(packed, [0b10000000])
  })

  it('packs a full byte left to right', () => {
    const packed = packRasterRows([[true, true, true, true, true, true, true, true]], 8)
    assertBytes(packed, [0xff])
  })

  it('pads a row that is not a whole number of bytes', () => {
    // 12 dots is 2 bytes; the last 4 bits are padding and must stay zero, or the next row
    // shifts sideways.
    const packed = packRasterRows([[true, false, false, false, false, false, false, false, true, false, false, false]], 12)
    assertBytes(packed, [0b10000000, 0b10000000])
  })

  it('writes each row on a byte boundary', () => {
    const packed = packRasterRows(
      [
        [true],
        [false, false, false, false, false, false, false, true]
      ],
      8
    )
    // Row 0: bit 7 set. Row 1: bit 0 set, in the SECOND byte.
    assertBytes(packed, [0b10000000, 0b00000001])
  })

  it('sizes the buffer from the row count', () => {
    const packed = packRasterRows([[true], [true], [true]], 8)
    assert.equal(packed.length, 3)
  })

  it('accepts a one-shot iterable without losing rows', () => {
    // The row count is needed up front to size the buffer; a generator consumed by the counting
    // pass would leave nothing to pack.
    function* rows() {
      yield [true, true]
      yield [false, false]
    }

    assertBytes(packRasterRows(rows(), 8), [0b11000000, 0x00])
  })

  it('handles an empty image', () => {
    assert.equal(packRasterRows([], 8).length, 0)
  })
})

describe('thresholdToBits', () => {
  it('marks dark pixels black', () => {
    const grey = new Uint8Array([0, 127, 128, 255])
    assert.deepEqual(thresholdToBits(grey, 4, 1), [[true, true, false, false]])
  })

  it('respects an explicit threshold', () => {
    assert.deepEqual(thresholdToBits(new Uint8Array([100]), 1, 1, 200), [[true]])
    assert.deepEqual(thresholdToBits(new Uint8Array([200]), 1, 1, 200), [[false]])
  })

  it('lays rows out by the declared width', () => {
    const grey = new Uint8Array([0, 255, 255, 0])
    assert.deepEqual(thresholdToBits(grey, 2, 2), [
      [true, false],
      [false, true]
    ])
  })
})

describe('ditherToBits', () => {
  it('leaves pure black and pure white alone', () => {
    assert.deepEqual(ditherToBits(new Uint8Array([0, 0]), 2, 1), [[true, true]])
    assert.deepEqual(ditherToBits(new Uint8Array([255, 255]), 2, 1), [[false, false]])
  })

  it('turns mid grey into a mixture rather than a solid block', () => {
    // The point of error diffusion: a threshold would render 50% grey as either all black or all
    // white, which is why photographs come out as grey smears without it.
    const width = 16
    const height = 16
    const grey = new Uint8Array(width * height).fill(128)
    const bits = ditherToBits(grey, width, height)

    const black = bits.flat().filter(Boolean).length
    const total = width * height
    assert.ok(black > total * 0.3, `expected a mix, got ${black}/${total} black`)
    assert.ok(black < total * 0.7, `expected a mix, got ${black}/${total} black`)
  })

  it('produces one row per input row', () => {
    const bits = ditherToBits(new Uint8Array(12), 4, 3)
    assert.equal(bits.length, 3)
    assert.equal(bits[0]?.length, 4)
  })

  it('does not mutate the array it was given', () => {
    const grey = new Uint8Array([0, 128, 255])
    const copy = Uint8Array.from(grey)
    ditherToBits(grey, 3, 1)
    assertBytes(grey, [...copy])
  })
})
