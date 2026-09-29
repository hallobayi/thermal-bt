/**
 * ESC/POS command bytes.
 *
 * Every function here is pure and returns the exact byte sequence a printer expects. Nothing
 * in this file knows about browsers, transports, or documents — which is what makes the
 * protocol layer testable byte by byte.
 *
 * The command set mirrors what the original `rawbt-js-library` emitted, so printers already
 * known to work with it keep working. Where the original was wrong (see `feed`, `cut`), the
 * behaviour is preserved deliberately and the deviation is documented instead of silently
 * "fixed", because a receipt that suddenly prints differently is a real regression.
 */

/** Control characters used as command introducers. */
export const ESC = 0x1b
export const FS = 0x1c
export const GS = 0x1d
export const LF = 0x0a
export const CR = 0x0d
export const HT = 0x09
export const FF = 0x0c

/** `ESC a n` values. */
export const ALIGNMENT = { left: 0, center: 1, right: 2 } as const
export type Alignment = keyof typeof ALIGNMENT

/** `ESC - n` values. */
export const UNDERLINE = { none: 0, single: 1, double: 2 } as const
export type UnderlineMode = (typeof UNDERLINE)[keyof typeof UNDERLINE]

/** `GS V m` values. */
export const CUT = { full: 65, partial: 66 } as const
export type CutMode = (typeof CUT)[keyof typeof CUT]

/**
 * `ESC ! n` bit flags.
 *
 * The size presets are combinations of the two doubling bits rather than printer-specific
 * "font sizes", because that is all the command actually offers.
 */
export const PRINT_MODE = {
  fontA: 0x00,
  fontB: 0x01,
  emphasized: 0x08,
  doubleHeight: 0x10,
  doubleWidth: 0x20,
  italic: 0x40,
  underline: 0x80
} as const

/** `GS H n` values, combinable for `both`. */
export const HRI = { none: 0, above: 1, below: 2 } as const

/** Named positions, for an options object. */
export type HriPosition = keyof typeof HRI

/** The numeric value `GS H n` takes. */
export type HriValue = (typeof HRI)[keyof typeof HRI]

/**
 * `GS k m` values for the symbologies the original library exposed.
 *
 * These are the "function B" selectors, where the data length is passed as a byte instead of
 * being terminated by NUL — that is why `barcode` needs the length.
 */
export const BARCODE = {
  upcA: 65,
  upcE: 66,
  ean13: 67,
  ean8: 68,
  code39: 69,
  itf: 70,
  codabar: 71,
  code93: 72,
  code128: 73
} as const
export type BarcodeType = keyof typeof BARCODE

/** `GS ( k` QR error-correction levels, as the `48 + n` offset the command wants. */
export const QR_EC_LEVEL = { L: 0, M: 1, Q: 2, H: 3 } as const
export type QrEcLevel = keyof typeof QR_EC_LEVEL

/** `GS ( k` QR model selectors. */
export const QR_MODEL = { model1: 1, model2: 2, micro: 3 } as const
export type QrModel = keyof typeof QR_MODEL

/** QR module size in dots. The command accepts 1-16. */
export type QrModuleSize = number

function byte(value: number): number {
  // Masking rather than rejecting keeps parity with the original, which silently truncated
  // out-of-range values through its `chr()` helper.
  return value & 0xff
}

export function initialize(): number[] {
  return [ESC, 0x40]
}

export function align(mode: Alignment): number[] {
  return [ESC, 0x61, ALIGNMENT[mode]]
}

export function bold(on: boolean): number[] {
  return [ESC, 0x45, on ? 1 : 0]
}

export function underline(mode: UnderlineMode): number[] {
  return [ESC, 0x2d, mode]
}

export function printMode(mode: number): number[] {
  return [ESC, 0x21, byte(mode)]
}

/**
 * `ESC d n` when `lines >= 2`, otherwise `LF CR`.
 *
 * The odd fallback is inherited from the original library: some printers ignore `ESC d 1`
 * but honour a plain newline. Preserved on purpose.
 */
export function feed(lines: number): number[] {
  if (lines < 2) return [LF, CR]
  return [ESC, 0x64, byte(lines)]
}

export function newline(): number[] {
  return [LF]
}

/** `FF` — release a slip/document printer's paper. */
export function feedForm(): number[] {
  return [FF]
}

/** `ESC q` — some slip printers need this before they let go of the paper. */
export function release(): number[] {
  return [ESC, 0x71]
}

export function feedReverse(lines: number): number[] {
  return [ESC, 0x65, byte(lines)]
}

export function cut(mode: CutMode = CUT.full, lines = 3): number[] {
  return [GS, 0x56, mode, byte(lines)]
}

export function barcodeHeight(dots: number): number[] {
  return [GS, 0x68, byte(dots)]
}

export function barcodeWidth(dots: number): number[] {
  return [GS, 0x77, byte(dots)]
}

export function barcodeTextPosition(position: number): number[] {
  return [GS, 0x48, byte(position)]
}

/**
 * `GS k m n d1...dn` — print a barcode.
 *
 * `content` must already be encoded to bytes; the length written into the command is the byte
 * length, not the JavaScript string length. The original used `content.length`, which corrupts
 * the command for any non-ASCII payload.
 */
export function barcode(content: readonly number[], type: BarcodeType): number[] {
  const bytes: number[] = [GS, 0x6b, BARCODE[type], content.length]
  for (const value of content) bytes.push(byte(value))
  return bytes
}

/**
 * `FS . ESC t n` — select a code page, or `FS &` to switch to Kanji mode.
 *
 * A negative code means "Kanji", matching the original's sentinel for `GBK`.
 */
export function characterTable(number: number): number[] {
  if (number < 0) return [FS, 0x26]
  return [FS, 0x2e, ESC, 0x74, byte(number)]
}

/** `ESC p m t1 t2` — kick the cash drawer wired to the printer. */
export function openDrawer(pin: 0 | 1 = 0, onTime = 25, offTime = 250): number[] {
  return [ESC, 0x70, pin, byte(onTime), byte(offTime)]
}

/**
 * Raster image: `GS v 0 m xL xH yL yH d1...dk`.
 *
 * `data` is already 1-bit packed, one bit per dot, MSB first, rows padded to whole bytes —
 * `packRasterRows` produces exactly that.
 */
export function rasterImage(data: readonly number[], widthDots: number, heightDots: number): number[] {
  const bytesPerRow = Math.ceil(widthDots / 8)
  const bytes: number[] = [
    GS,
    0x76,
    0x30,
    0x00,
    byte(bytesPerRow),
    byte(bytesPerRow >> 8),
    byte(heightDots),
    byte(heightDots >> 8)
  ]
  for (const value of data) bytes.push(byte(value))
  return bytes
}

/**
 * `GS ( k` wrapper for the two-dimensional barcode commands.
 *
 * The header carries the payload length plus the two bytes for `cn`/`fn`, little-endian.
 */
function symbolData(
  fn: number,
  code: number,
  data: readonly number[],
  prefix: readonly number[] = []
): number[] {
  const payload = [...prefix, ...data]
  const length = payload.length + 2

  const bytes: number[] = [GS, 0x28, 0x6b, byte(length), byte(length >> 8), code, fn]
  for (const value of payload) bytes.push(byte(value))
  return bytes
}

/** QR code selector byte (`GS ( k` with `cn = 49`). */
const QR_CODE_TYPE = 0x31

const QR_FN = {
  model: 0x41,
  moduleSize: 0x43,
  errorCorrection: 0x45,
  store: 0x50,
  print: 0x51
} as const

/**
 * `GS ( k` — model, module size, error correction, store, print.
 *
 * `content` must already be encoded to bytes; QR content is limited to 2953 bytes, so the
 * caller is responsible for keeping it short enough.
 */
export function qrcode(content: readonly number[], options: QrOptions = {}): number[] {
  const ec = options.ec ?? 'L'
  const model = options.model ?? 'model2'
  const size = options.moduleSize ?? 3

  const bytes: number[] = []
  // Select model, then a trailing 0x00 as the command requires.
  bytes.push(...symbolData(QR_FN.model, QR_CODE_TYPE, [0x00], [byte(0x30 + QR_MODEL[model])]))
  bytes.push(...symbolData(QR_FN.moduleSize, QR_CODE_TYPE, [byte(size)]))
  bytes.push(...symbolData(QR_FN.errorCorrection, QR_CODE_TYPE, [byte(0x30 + QR_EC_LEVEL[ec])]))
  // Store the payload; the 0x30 prefix selects the default encoding.
  bytes.push(...symbolData(QR_FN.store, QR_CODE_TYPE, content, [0x30]))
  // Print what was stored.
  bytes.push(...symbolData(QR_FN.print, QR_CODE_TYPE, [], [0x30]))

  return bytes
}

export interface QrOptions {
  ec?: QrEcLevel | undefined
  moduleSize?: QrModuleSize | undefined
  model?: QrModel | undefined
}
