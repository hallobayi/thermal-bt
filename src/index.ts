/**
 * thermal-bt — ESC/POS printing from the browser to an Android thermal printer app.
 *
 * The shape of the API:
 *
 *     const job = new PrintDocument({ columns: 32 })
 *     job.initialize().header('MY STORE', 'Jl. Contoh 1').rule()
 *     job.keyValue('Coffee', 'Rp 25.000').rule()
 *     job.barcode('INV-001', 'code128')
 *     job.feed(2).cut()
 *     await print(job)
 *
 * A job is data. Which transport carries it decides how much of it survives, and every transport
 * says so up front in `capabilities` and afterwards in `warnings`.
 */

import { PrintDocument } from './document/PrintDocument.ts'
import {
  createTransports,
  defaultTransport,
  getTransport,
  supportedTransports
} from './transport/index.ts'
import type { PrintRequest, Transport, TransportId, TransportOutcome } from './transport/types.ts'

export interface PrintOptions {
  /** A specific transport, by id or instance. Defaults to the best available one. */
  transport?: TransportId | Transport | undefined
  /** Overrides the document's paper width. */
  columns?: number | undefined
  /** Document name shown by the receiving app. */
  title?: string | undefined
  /** Where to send the user if the target app is not installed. */
  fallbackUrl?: string | undefined
  /** Markup to print instead of rendering the document (raster transports only). */
  html?: string | undefined
}

/**
 * Send a document with the best available transport.
 *
 * Returns the outcome instead of throwing on a failed hand-off: "the app is not installed" is a
 * normal situation for a web page, not an exception, and the caller needs the `warnings` to tell
 * the user which parts of their receipt were dropped.
 */
export async function print(
  document: PrintDocument,
  options: PrintOptions = {}
): Promise<TransportOutcome> {
  const transport = resolveTransport(options.transport)

  const request: PrintRequest = {
    document,
    columns: options.columns,
    title: options.title,
    fallbackUrl: options.fallbackUrl,
    html: options.html
  }

  return transport.send(request)
}

function resolveTransport(selection: PrintOptions['transport']): Transport {
  if (selection === undefined) return defaultTransport()
  if (typeof selection === 'string') return getTransport(selection)
  return selection
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

export { PrintDocument, createDocument, DEFAULT_COLUMNS } from './document/PrintDocument.ts'
export type { PrintDocumentOptions } from './document/PrintDocument.ts'
export type { PrintOperation } from './document/operations.ts'

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

export { renderEscPos } from './document/renderEscPos.ts'
export type { EscPosRenderOptions, RenderOutput } from './document/renderEscPos.ts'
export { renderPlainText } from './document/renderPlainText.ts'
export type { PlainTextRenderOptions } from './document/renderPlainText.ts'
export { renderHtml } from './document/renderHtml.ts'
export type { HtmlRenderOptions } from './document/renderHtml.ts'

// ---------------------------------------------------------------------------------------------
// ESC/POS
// ---------------------------------------------------------------------------------------------

export {
  EscPosEncoder,
  createEncoder,
  FONT_SIZE,
  ALIGNMENT,
  BARCODE,
  CUT,
  HRI,
  PRINT_MODE,
  QR_EC_LEVEL,
  QR_MODEL,
  UNDERLINE
} from './escpos/EscPosEncoder.ts'
export type {
  Alignment,
  BarcodeOptions,
  BarcodeType,
  CutMode,
  EscPosEncoderOptions,
  FontSize,
  HriPosition,
  QrEcLevel,
  QrModel,
  QrcodeOptions,
  UnderlineMode
} from './escpos/EscPosEncoder.ts'

export {
  CODEPAGE_DEFINITIONS,
  DEFAULT_CODEPAGE,
  UnsupportedCodepageError,
  decodeByte,
  encodeText,
  escPosCodepageNumber,
  getCodepageDefinition,
  resolveCodepage,
  tryResolveCodepage
} from './escpos/codepages.ts'
export type {
  CodepageDefinition,
  CodepageId,
  CodepageNumbering,
  EncodedText
} from './escpos/codepages.ts'

export { ditherToBits, packRasterRows, thresholdToBits } from './escpos/raster.ts'

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

export {
  alignRightIn,
  centerIn,
  horizontalRule,
  padBetween,
  paperColumns,
  stripControlCharacters,
  wrapText
} from './text/layout.ts'
export { escapeHtml } from './text/html.ts'

// ---------------------------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------------------------

export {
  createTransports,
  defaultTransport,
  getTransport,
  supportedTransports,
  buildIntentUri,
  escapeIntentValue,
  parseIntentUri,
  base64ToBytes,
  bytesToBase64,
  percentEscapeBytes,
  detectEnvironment,
  openIntentUri,
  RawBtTransport,
  RawThermalRawTransport,
  RawThermalShareTransport,
  SystemPrintTransport,
  buildRawBtUri,
  buildRawThermalRawUri,
  buildRawThermalShareUri,
  RAWBT_PACKAGE,
  RAW_THERMAL_PACKAGE,
  RAW_THERMAL_PRINT_RAW_ACTION,
  RAW_THERMAL_DATA_EXTRA
} from './transport/index.ts'
export type {
  IntentSpec,
  ParsedIntent
} from './transport/index.ts'
export type {
  Environment,
  PrintRequest,
  Transport,
  TransportCapabilities,
  TransportId,
  TransportOutcome
} from './transport/index.ts'
