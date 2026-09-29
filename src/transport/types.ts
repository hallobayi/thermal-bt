/**
 * Transport contract.
 *
 * A transport is a way of getting a document to a printer app. Each one has different
 * abilities, and pretending otherwise is how you end up with a receipt that silently loses its
 * barcode. So capabilities are declared, and `send` reports what it could not deliver.
 */

import type { PrintDocument } from '../document/PrintDocument.ts'

export type TransportId = 'rawbt' | 'rawthermal-share' | 'rawthermal-raw' | 'system-print'

export interface TransportCapabilities {
  /** The ESC/POS byte stream reaches the printer unchanged. */
  rawEscPos: boolean
  bold: boolean
  underline: boolean
  textSize: boolean
  alignment: boolean
  barcodes: boolean
  qrcodes: boolean
  images: boolean
  cut: boolean
  cashDrawer: boolean
  /** The receiving app asks the user to confirm before anything prints. */
  requiresConfirmation: boolean
  /** Output is rasterised rather than printed as characters. */
  raster: boolean
}

export interface PrintRequest {
  document: PrintDocument
  /** Overrides the document's paper width. */
  columns?: number | undefined
  /** Document name shown by the receiving app. Defaults per transport. */
  title?: string | undefined
  /**
   * Markup to print instead of rendering the document.
   *
   * Only the raster transports use it. Callers that already have HTML — a web app printing its
   * own page — should pass it rather than rebuild their layout as a print document.
   */
  html?: string | undefined
  /** Where to send the user when the target app is not installed. */
  fallbackUrl?: string | undefined
}

export interface TransportOutcome {
  ok: boolean
  /** What the user should expect to happen next, in plain language. */
  message: string
  /** Parts of the document this path could not deliver. */
  warnings: string[]
  /** The URI handed to Android, when one was used. Kept for debugging and for tests. */
  uri?: string | undefined
}

export interface Transport {
  readonly id: TransportId
  readonly label: string
  /** One sentence a user can act on, shown when picking a transport. */
  readonly description: string
  readonly capabilities: TransportCapabilities
  /**
   * Whether this path can be used in the current browser at all.
   *
   * Note the limit: a browser cannot tell whether a given Android app is installed, so this
   * answers "is this kind of hand-off available here", not "will it reach the printer".
   */
  isSupported(): boolean
  send(request: PrintRequest): Promise<TransportOutcome>
}
