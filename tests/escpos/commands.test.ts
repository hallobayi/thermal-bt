/**
 * Byte-level tests for the ESC/POS command layer.
 *
 * These are the tests that would have caught the original library's bugs, because they assert on
 * the exact bytes rather than on "a string was produced".
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  barcode,
  barcodeHeight,
  barcodeTextPosition,
  barcodeWidth,
  bold,
  characterTable,
  cut,
  feed,
  feedForm,
  feedReverse,
  initialize,
  newline,
  openDrawer,
  qrcode,
  rasterImage,
  release,
  underline,
  align
} from '../../src/escpos/commands.ts'
import { assertBytes } from '../support/bytes.ts'

describe('ESC/POS commands', () => {
  it('initializes with ESC @', () => {
    assertBytes(initialize(), [0x1b, 0x40])
  })

  it('selects each alignment', () => {
    assertBytes(align('left'), [0x1b, 0x61, 0x00])
    assertBytes(align('center'), [0x1b, 0x61, 0x01])
    assertBytes(align('right'), [0x1b, 0x61, 0x02])
  })

  it('toggles bold with ESC E', () => {
    assertBytes(bold(true), [0x1b, 0x45, 0x01])
    assertBytes(bold(false), [0x1b, 0x45, 0x00])
  })

  it('selects underline thickness with ESC -', () => {
    assertBytes(underline(0), [0x1b, 0x2d, 0x00])
    assertBytes(underline(1), [0x1b, 0x2d, 0x01])
    assertBytes(underline(2), [0x1b, 0x2d, 0x02])
  })

  it('uses LF CR for a single line and ESC d for several', () => {
    // The fallback for one line is inherited behaviour: some printers ignore `ESC d 1`.
    assertBytes(feed(1), [0x0a, 0x0d])
    assertBytes(feed(0), [0x0a, 0x0d])
    assertBytes(feed(2), [0x1b, 0x64, 0x02])
    assertBytes(feed(5), [0x1b, 0x64, 0x05])
  })

  it('emits a bare LF for a newline', () => {
    assertBytes(newline(), [0x0a])
  })

  it('cuts paper with GS V', () => {
    assertBytes(cut(65, 3), [0x1d, 0x56, 0x41, 0x03])
    assertBytes(cut(66, 0), [0x1d, 0x56, 0x42, 0x00])
  })

  it('emits form feed and release', () => {
    assertBytes(feedForm(), [0x0c])
    assertBytes(release(), [0x1b, 0x71])
    assertBytes(feedReverse(2), [0x1b, 0x65, 0x02])
  })

  it('opens the cash drawer with ESC p', () => {
    assertBytes(openDrawer(0, 25, 250), [0x1b, 0x70, 0x00, 0x19, 0xfa])
    assertBytes(openDrawer(1, 50, 200), [0x1b, 0x70, 0x01, 0x32, 0xc8])
  })

  it('selects a code page with FS . ESC t n', () => {
    assertBytes(characterTable(17), [0x1c, 0x2e, 0x1b, 0x74, 0x11])
    assertBytes(characterTable(255), [0x1c, 0x2e, 0x1b, 0x74, 0xff])
  })

  it('selects Kanji mode for a negative code page', () => {
    // The original library's sentinel for GBK. It returned a two-byte string where the caller
    // expected a complete command, so the mode was never actually entered.
    assertBytes(characterTable(-1), [0x1c, 0x26])
  })

  it('prints a barcode with GS k and a byte-length prefix', () => {
    assertBytes(barcode([0x41, 0x42, 0x43], 'code128'), [0x1d, 0x6b, 0x49, 0x03, 0x41, 0x42, 0x43])
  })

  it('lengths a barcode by bytes, not by JavaScript characters', () => {
    // Three bytes that are two UTF-16 units — the case the original got wrong by using
    // `content.length`, which desynchronises the printer's read of the stream.
    const bytes = [0xc3, 0xa9, 0x41]
    assertBytes(barcode(bytes, 'code39'), [0x1d, 0x6b, 0x45, 0x03, 0xc3, 0xa9, 0x41])
  })

  it('sets barcode geometry with GS h, GS w and GS H', () => {
    assertBytes(barcodeHeight(60), [0x1d, 0x68, 0x3c])
    assertBytes(barcodeWidth(2), [0x1d, 0x77, 0x02])
    assertBytes(barcodeTextPosition(2), [0x1d, 0x48, 0x02])
  })

  it('builds the five GS ( k sequences a QR code needs', () => {
    // model 2, module size 3, error correction L, content "AB", then print.
    assertBytes(qrcode([0x41, 0x42], { model: 'model2', moduleSize: 3, ec: 'L' }), [
      // select model
      0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
      // module size
      0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x03,
      // error correction L
      0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30,
      // store "AB"
      0x1d, 0x28, 0x6b, 0x05, 0x00, 0x31, 0x50, 0x30, 0x41, 0x42,
      // print
      0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30
    ])
  })

  it('writes the raster header with little-endian dimensions', () => {
    // 384 dots is 48 bytes per row; 2 rows.
    assertBytes(rasterImage([0x00, 0x00], 384, 2), [
      0x1d, 0x76, 0x30, 0x00, 0x30, 0x00, 0x02, 0x00, 0x00, 0x00
    ])
  })

  it('writes a raster width above 255 across two bytes', () => {
    // 2048 dots is 256 bytes per row, so the low byte is 0 and the high byte is 1.
    assertBytes(rasterImage([], 2048, 1), [0x1d, 0x76, 0x30, 0x00, 0x00, 0x01, 0x01, 0x00])
  })

  it('masks values that do not fit in a byte', () => {
    // Parity with the original's silent truncation, so a caller passing 256 gets 0 rather than
    // a corrupt stream.
    assertBytes(barcodeHeight(256), [0x1d, 0x68, 0x00])
  })
})
