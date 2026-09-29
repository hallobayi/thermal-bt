/**
 * ESC/POS byte writer.
 *
 * This is the single place that turns intent ("bold on", "print this barcode") into printer
 * bytes. It replaces the original library's approach of concatenating percent-escaped strings
 * into a buffer, which had three problems: the escapes were indistinguishable from the data
 * (so a `%` in a receipt broke the stream), every intermediate value leaked into the global
 * scope, and nothing could be asserted in a test without round-tripping through a transport.
 *
 * The writer accumulates real bytes and hands back a `Uint8Array`. Percent-escaping, base64,
 * and every other on-the-wire encoding belongs to the transports, not here.
 */

import {
  ALIGNMENT,
  BARCODE,
  CUT,
  HRI,
  PRINT_MODE,
  QR_EC_LEVEL,
  QR_MODEL,
  UNDERLINE,
  align as cmdAlign,
  barcode as cmdBarcode,
  barcodeHeight as cmdBarcodeHeight,
  barcodeTextPosition as cmdBarcodeTextPosition,
  barcodeWidth as cmdBarcodeWidth,
  bold as cmdBold,
  characterTable as cmdCharacterTable,
  cut as cmdCut,
  feed as cmdFeed,
  feedForm as cmdFeedForm,
  feedReverse as cmdFeedReverse,
  initialize as cmdInitialize,
  newline as cmdNewline,
  openDrawer as cmdOpenDrawer,
  printMode as cmdPrintMode,
  qrcode as cmdQrcode,
  rasterImage as cmdRasterImage,
  release as cmdRelease,
  underline as cmdUnderline,
  type Alignment,
  type BarcodeType,
  type CutMode,
  type HriPosition,
  type QrEcLevel,
  type QrModel,
  type UnderlineMode
} from './commands.ts'
import {
  DEFAULT_CODEPAGE,
  encodeText,
  escPosCodepageNumber,
  resolveCodepage,
  type CodepageId,
  type CodepageNumbering
} from './codepages.ts'
import { wrapText } from '../text/layout.ts'

/**
 * `ESC ! n` presets.
 *
 * Named for what they look like rather than as "font sizes", because the command only has two
 * doubling bits and different printers render the results at different point sizes.
 */
export const FONT_SIZE = {
  normal: PRINT_MODE.fontA,
  /** Condensed font B — narrower characters, more columns per line. */
  small: PRINT_MODE.fontB,
  /** Double height only. */
  tall: PRINT_MODE.doubleHeight,
  /** Double width only. */
  wide: PRINT_MODE.doubleWidth,
  /** Both doubled. */
  large: PRINT_MODE.doubleHeight | PRINT_MODE.doubleWidth
} as const

export type FontSize = keyof typeof FONT_SIZE

export interface BarcodeOptions {
  /** Dot height of the bars. */
  height?: number | undefined
  /** Dot width of the narrowest bar. Values above 6 tend to have no effect. */
  width?: number | undefined
  /** Where the human-readable text goes. */
  hri?: HriPosition | 'both' | undefined
  /** How to encode the barcode's content. Defaults to the writer's code page. */
  codepage?: CodepageId | undefined
}

export interface QrcodeOptions {
  ec?: QrEcLevel | undefined
  /** Module size in dots, 1-16. */
  moduleSize?: number | undefined
  model?: QrModel | undefined
  codepage?: CodepageId | undefined
}

export interface EscPosEncoderOptions {
  /** Code page used for text. Accepts the original library's spellings. */
  codepage?: string | undefined
  /** Which `ESC t n` numbering the printer uses. */
  numbering?: CodepageNumbering | undefined
}

/**
 * Accumulates ESC/POS bytes.
 *
 * Every mutating method returns `this`, so a receipt can be built as one readable chain.
 */
export class EscPosEncoder {
  /**
   * Plain array rather than a growing `Uint8Array`: the size of a receipt is not known up
   * front, and doubling a typed array on every append is a lot of copying for a few kilobytes.
   */
  private buffer: number[] = []
  private codepageId: CodepageId
  private readonly numbering: CodepageNumbering
  private unmappedCharacters = new Set<string>()

  constructor(options: EscPosEncoderOptions = {}) {
    this.codepageId = options.codepage === undefined
      ? DEFAULT_CODEPAGE
      : resolveCodepage(options.codepage)
    this.numbering = options.numbering ?? 'rawbt'
  }

  // ---------------------------------------------------------------------------------------
  // Introspection
  // ---------------------------------------------------------------------------------------

  /** Characters the active code page could not represent, in first-seen order. */
  get unmapped(): string[] {
    return [...this.unmappedCharacters]
  }

  get activeCodepage(): CodepageId {
    return this.codepageId
  }

  /** Bytes written so far. */
  get length(): number {
    return this.buffer.length
  }

  /** The bytes accumulated so far, as a copy. */
  encode(): Uint8Array {
    return Uint8Array.from(this.buffer)
  }

  // ---------------------------------------------------------------------------------------
  // Primitives
  // ---------------------------------------------------------------------------------------

  /**
   * Append raw bytes.
   *
   * Appended one at a time on purpose. `push(...bytes)` throws `RangeError` somewhere between
   * 100k and 200k arguments on V8, so a large raster image would crash rather than print.
   */
  raw(bytes: readonly number[] | Uint8Array): this {
    for (const value of bytes) this.buffer.push(value & 0xff)
    return this
  }

  // ---------------------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------------------

  /** `ESC @` — reset the printer to its power-on defaults. */
  initialize(): this {
    return this.raw(cmdInitialize())
  }

  /** Select a code page and remember it for subsequent `text()` calls. */
  codepage(id: string): this {
    this.codepageId = resolveCodepage(id)
    const number = escPosCodepageNumber(this.codepageId, this.numbering)
    if (number !== null) this.raw(cmdCharacterTable(number))
    return this
  }

  /** `FS . ESC t n` with an explicit number, for printers not covered by the named code pages. */
  characterTable(number: number): this {
    return this.raw(cmdCharacterTable(number))
  }

  // ---------------------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------------------

  /**
   * Encode and append text without a trailing newline.
   *
   * The active code page is applied here. Characters it cannot represent become `?` and are
   * recorded in `unmapped`.
   */
  text(value: string): this {
    const { bytes, unmapped } = encodeText(value, this.codepageId)
    for (const character of unmapped) this.unmappedCharacters.add(character)
    return this.raw(bytes)
  }

  /** Append text followed by a line break. */
  line(value = ''): this {
    return this.text(value).newline()
  }

  /** `LF`, repeated `count` times. */
  newline(count = 1): this {
    for (let index = 0; index < count; index++) this.raw(cmdNewline())
    return this
  }

  /** Wrap text to `columns` and print it as one line per wrapped segment. */
  textBlock(value: string, columns: number): this {
    for (const wrapped of wrapText(value, columns)) this.line(wrapped)
    return this
  }

  // ---------------------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------------------

  align(mode: Alignment): this {
    return this.raw(cmdAlign(mode))
  }

  bold(on = true): this {
    return this.raw(cmdBold(on))
  }

  underline(mode: UnderlineMode = UNDERLINE.single): this {
    return this.raw(cmdUnderline(mode))
  }

  /** Apply one of the `FONT_SIZE` presets. */
  fontSize(size: FontSize): this {
    return this.raw(cmdPrintMode(FONT_SIZE[size]))
  }

  /**
   * Set `ESC ! n` directly, for the combinations the presets do not cover.
   *
   * The bits are exported as `PRINT_MODE`, so `PRINT_MODE.fontB | PRINT_MODE.doubleWidth` is
   * a readable way to build a value.
   */
  printMode(mode: number): this {
    return this.raw(cmdPrintMode(mode))
  }

  /** Return every formatting attribute to its default. */
  resetFormatting(): this {
    return this.align('left').bold(false).underline(UNDERLINE.none).fontSize('normal')
  }

  // ---------------------------------------------------------------------------------------
  // Spacing and paper
  // ---------------------------------------------------------------------------------------

  /** `ESC d n` — advance `lines` lines. */
  feed(lines = 1): this {
    return this.raw(cmdFeed(lines))
  }

  /** `FF` — some slip printers need this to let go of the paper. */
  feedForm(): this {
    return this.raw(cmdFeedForm())
  }

  /** `ESC q` — release a slip printer's paper. */
  release(): this {
    return this.raw(cmdRelease())
  }

  /** `ESC e n` — feed backwards, for slip printers with a reverse motor. */
  feedReverse(lines = 1): this {
    return this.raw(cmdFeedReverse(lines))
  }

  /** `GS V m n` — cut the paper. */
  cut(mode: CutMode = CUT.full, lines = 3): this {
    return this.raw(cmdCut(mode, lines))
  }

  /** `ESC p m t1 t2` — kick the cash drawer. */
  openDrawer(pin: 0 | 1 = 0, onTime = 25, offTime = 250): this {
    return this.raw(cmdOpenDrawer(pin, onTime, offTime))
  }

  // ---------------------------------------------------------------------------------------
  // Barcodes and 2D symbols
  // ---------------------------------------------------------------------------------------

  /**
   * Print a barcode.
   *
   * `content` is encoded with the writer's code page unless `options.codepage` says otherwise,
   * and the command's length byte is the *byte* count. The original library passed the
   * JavaScript string length, which desynchronises the stream for non-ASCII content.
   */
  barcode(content: string, type: BarcodeType = 'code39', options: BarcodeOptions = {}): this {
    const { bytes } = encodeText(content, options.codepage ?? this.codepageId)

    if (options.height !== undefined) this.raw(cmdBarcodeHeight(options.height))
    if (options.width !== undefined) this.raw(cmdBarcodeWidth(options.width))
    if (options.hri !== undefined) this.raw(cmdBarcodeTextPosition(hriValue(options.hri)))

    return this.raw(cmdBarcode([...bytes], type))
  }

  /** Print a QR code. */
  qrcode(content: string, options: QrcodeOptions = {}): this {
    const { bytes } = encodeText(content, options.codepage ?? this.codepageId)
    return this.raw(
      cmdQrcode([...bytes], {
        ...(options.ec === undefined ? {} : { ec: options.ec }),
        ...(options.moduleSize === undefined ? {} : { moduleSize: options.moduleSize }),
        ...(options.model === undefined ? {} : { model: options.model })
      })
    )
  }

  /**
   * Print a 1-bit raster image.
   *
   * `data` is packed one bit per dot, MSB first, each row padded to a whole byte —
   * `packRasterRows` produces exactly that from a threshold function.
   */
  image(data: readonly number[] | Uint8Array, widthDots: number, heightDots: number): this {
    return this.raw(cmdRasterImage([...data], widthDots, heightDots))
  }

  // ---------------------------------------------------------------------------------------
  // High-level helpers
  // ---------------------------------------------------------------------------------------

  /** A heading: centred, large, bold, with a rule under it. */
  header(title: string, subtitle: string | undefined, columns: number): this {
    this.align('center').fontSize('large').bold(true).line(title)
    this.fontSize('normal').bold(false)
    if (subtitle !== undefined && subtitle.length > 0) this.line(subtitle)
    this.align('left')
    return this
  }

  /**
   * A `label .......... value` line.
   *
   * Pads with spaces rather than tabs: tab stops vary between printer firmware, and a receipt
   * that lines up on one printer and not another is worse than one that always lines up.
   */
  keyValue(label: string, value: string, columns: number): this {
    const gap = columns - label.length - value.length
    if (gap >= 1) return this.line(`${label}${' '.repeat(gap)}${value}`)

    // Too long to sit on one line: put the value underneath, indented to the right.
    this.line(label)
    return this.line(`${' '.repeat(Math.max(0, columns - value.length))}${value}`)
  }
}

function hriValue(position: HriPosition | 'both'): number {
  // `GS H` takes a bitmask, so "both" is the two flags OR-ed together.
  if (position === 'both') return HRI.above | HRI.below
  return HRI[position]
}

/** Convenience factory, mirroring the original library's `getCurrentDriver()`. */
export function createEncoder(options?: EscPosEncoderOptions): EscPosEncoder {
  return new EscPosEncoder(options)
}

export { ALIGNMENT, BARCODE, CUT, HRI, PRINT_MODE, QR_EC_LEVEL, QR_MODEL, UNDERLINE }
export type { Alignment, BarcodeType, CutMode, HriPosition, QrEcLevel, QrModel, UnderlineMode }
