/**
 * A print document, described as data rather than as bytes.
 *
 * This is the central design decision of the rewrite. The original library's `PosPrinterJob`
 * pushed percent-escaped ESC/POS fragments into a string buffer, so the only thing that could
 * ever be done with a job was to send it to RawBT. Nothing else could read it — not a preview,
 * not a test, and not a different printer app.
 *
 * Here a job is a list of operations. The ESC/POS renderer turns them into bytes; the plain-text
 * renderer turns them into something Raw Thermal's share path can actually print; the HTML
 * renderer turns them into something the Android print dialog can rasterise. Same job, three
 * outputs — which is what makes "support more than one printer app" possible at all.
 */

import type {
  Alignment,
  BarcodeOptions,
  BarcodeType,
  CutMode,
  FontSize,
  QrcodeOptions,
  UnderlineMode
} from './operations.ts'
import type { PrintOperation } from './operations.ts'

/** Default columns for a 58 mm roll at the normal font. */
export const DEFAULT_COLUMNS = 32

export interface PrintDocumentOptions {
  /** Column width used by width-aware operations such as rules and `keyValue`. */
  columns?: number
}

/**
 * Fluent builder for a print job.
 *
 * Every method returns `this`, so a receipt reads top to bottom. The methods record intent
 * only; nothing here knows about bytes, transports, or Android.
 */
export class PrintDocument {
  private readonly operations: PrintOperation[] = []
  private columnCount: number

  constructor(options: PrintDocumentOptions = {}) {
    this.columnCount = options.columns ?? DEFAULT_COLUMNS
  }

  /** The operations recorded so far, in order. */
  get ops(): readonly PrintOperation[] {
    return this.operations
  }

  get columns(): number {
    return this.columnCount
  }

  /** Change the paper width used by width-aware operations. */
  paper(columns: number): this {
    this.columnCount = columns
    return this
  }

  private push(operation: PrintOperation): this {
    this.operations.push(operation)
    return this
  }

  // ---------------------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------------------

  /** Reset the printer. Almost every job should start with this. */
  initialize(): this {
    return this.push({ kind: 'initialize' })
  }

  /**
   * Select a code page.
   *
   * Named `setEncoding` as well, because that is what the original library called it and
   * existing receipts in the wild still call it that way.
   */
  codepage(codepage: string): this {
    return this.push({ kind: 'codepage', codepage })
  }

  setEncoding(codepage: string): this {
    return this.codepage(codepage)
  }

  // ---------------------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------------------

  /** Append text with no line break. */
  text(value: string): this {
    return this.push({ kind: 'text', value })
  }

  /** Append text followed by a line break. */
  line(value = ''): this {
    return this.push({ kind: 'line', value })
  }

  /** Alias kept for the original library's `printLine`. */
  printLine(value = ''): this {
    return this.line(value)
  }

  /** Append text wrapped to the paper width. */
  textBlock(value: string): this {
    return this.push({ kind: 'textBlock', value })
  }

  /** One or more line breaks. */
  newline(count = 1): this {
    return this.push({ kind: 'newline', count })
  }

  /** Alias kept for the original library's `newLine`. */
  newLine(count = 1): this {
    return this.newline(count)
  }

  /** A full-width rule of repeated characters. */
  rule(character = '-', columns?: number): this {
    return this.push({ kind: 'rule', character, columns })
  }

  /** A `label ... value` line, right-aligning the value. */
  keyValue(label: string, value: string, columns?: number): this {
    return this.push({ kind: 'keyValue', label, value, columns })
  }

  // ---------------------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------------------

  align(mode: Alignment): this {
    return this.push({ kind: 'align', align: mode })
  }

  left(): this {
    return this.align('left')
  }

  center(): this {
    return this.align('center')
  }

  right(): this {
    return this.align('right')
  }

  bold(on = true): this {
    return this.push({ kind: 'bold', on })
  }

  underline(mode: UnderlineMode | boolean = true): this {
    // The original accepted a boolean here; keeping that means old call sites keep working.
    const resolved: UnderlineMode = mode === true ? 1 : mode === false ? 0 : mode
    return this.push({ kind: 'underline', mode: resolved })
  }

  /** One of the `FONT_SIZE` presets. */
  fontSize(size: FontSize): this {
    return this.push({ kind: 'fontSize', size })
  }

  /** Raw `ESC ! n`, for combinations the presets do not cover. */
  printMode(mode: number): this {
    return this.push({ kind: 'printMode', mode })
  }

  /** Alias kept for the original library's `textSize`. */
  textSize(size: FontSize): this {
    return this.fontSize(size)
  }

  /** Clear every formatting attribute. */
  resetFormatting(): this {
    return this.align('left').bold(false).underline(0).fontSize('normal')
  }

  // ---------------------------------------------------------------------------------------
  // Spacing and paper
  // ---------------------------------------------------------------------------------------

  feed(lines = 1): this {
    return this.push({ kind: 'feed', lines })
  }

  feedForm(): this {
    return this.push({ kind: 'feedForm' })
  }

  release(): this {
    return this.push({ kind: 'release' })
  }

  feedReverse(lines = 1): this {
    return this.push({ kind: 'feedReverse', lines })
  }

  cut(mode: CutMode = 65, lines = 3): this {
    return this.push({ kind: 'cut', mode, lines })
  }

  openDrawer(pin: 0 | 1 = 0, onTime = 25, offTime = 250): this {
    return this.push({ kind: 'drawer', pin, onTime, offTime })
  }

  // ---------------------------------------------------------------------------------------
  // Symbols and images
  // ---------------------------------------------------------------------------------------

  barcode(content: string, type: BarcodeType = 'code39', options: BarcodeOptions = {}): this {
    return this.push({ kind: 'barcode', content, type, options })
  }

  qrcode(content: string, options: QrcodeOptions = {}): this {
    return this.push({ kind: 'qrcode', content, options })
  }

  /** Alias kept for the original library's `qrCode`. */
  qrCode(content: string, options: QrcodeOptions = {}): this {
    return this.qrcode(content, options)
  }

  /** A 1-bit raster image, already packed by `packRasterRows`. */
  image(data: readonly number[] | Uint8Array, widthDots: number, heightDots: number): this {
    return this.push({ kind: 'image', data: [...data], width: widthDots, height: heightDots })
  }

  /**
   * Escape hatch: raw ESC/POS bytes.
   *
   * Kept because no library can cover every printer's extensions, and refusing to offer this
   * would push people back to hand-rolling the whole stream.
   */
  raw(bytes: readonly number[] | Uint8Array): this {
    return this.push({ kind: 'raw', bytes: [...bytes] })
  }

  // ---------------------------------------------------------------------------------------
  // Convenience
  // ---------------------------------------------------------------------------------------

  /** A heading: centred, large, bold, with an optional subtitle. */
  header(title: string, subtitle?: string): this {
    this.center().fontSize('large').bold(true).line(title)
    this.fontSize('normal').bold(false)
    if (subtitle !== undefined) this.line(subtitle)
    return this.left()
  }

  /** The operations, as a plain array, for a renderer or a test to walk. */
  toOperations(): PrintOperation[] {
    return [...this.ops]
  }
}

export function createDocument(options?: PrintDocumentOptions): PrintDocument {
  return new PrintDocument(options)
}
