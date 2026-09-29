/**
 * Raw Thermal's two integration surfaces.
 *
 * There are exactly two, and the difference between them decides what you can print:
 *
 * **`rawthermal-share`** — works with the app as shipped. It is an `ACTION_SEND` of `text/plain`,
 * which the app's `MainActivity` picks up and turns into a document on its print screen. The
 * catch is what the app then does with it: `printTextDocument()` re-wraps the text to the paper
 * width and re-encodes it through its own code page. A raw ESC/POS stream cannot survive that,
 * because `ESC` is not in the code page table and becomes `?`, and the wrapping inserts breaks
 * inside command sequences. So this transport renders the job down to text and reports what it
 * had to drop.
 *
 * **`rawthermal-raw`** — needs the app to be rebuilt with the receiver in `android-patch/`.
 * It sends the ESC/POS bytes as base64 in a string extra, which the patched app writes straight
 * to the printer transport. This is the one that gives full parity with RawBT.
 */

import { renderEscPos } from '../document/renderEscPos.ts'
import { renderPlainText } from '../document/renderPlainText.ts'
import { bytesToBase64 } from './encoding.ts'
import { buildIntentUri } from './intentUri.ts'
import { detectEnvironment, openIntentUri } from './platform.ts'
import type { PrintRequest, Transport, TransportCapabilities, TransportOutcome } from './types.ts'

/** Application id, from `capacitor.config.ts` in the Raw Thermal project. */
export const RAW_THERMAL_PACKAGE = 'com.rawthermal.app'

/** Action the patch in `android-patch/` adds to `MainActivity`. */
export const RAW_THERMAL_PRINT_RAW_ACTION = 'com.rawthermal.app.action.PRINT_RAW'

/** String extra carrying `base64,<raw ESC/POS bytes>`. */
export const RAW_THERMAL_DATA_EXTRA = 'com.rawthermal.app.extra.DATA'

/** Default name the receiving app shows for a shared document. */
export const DEFAULT_SHARE_TITLE = 'receipt.txt'

export const RAW_THERMAL_SHARE_CAPABILITIES: TransportCapabilities = {
  rawEscPos: false,
  bold: false,
  underline: false,
  textSize: false,
  // Alignment survives as leading spaces, which monospace text keeps.
  alignment: true,
  barcodes: false,
  qrcodes: false,
  images: false,
  cut: false,
  cashDrawer: false,
  requiresConfirmation: true,
  raster: false
}

export const RAW_THERMAL_RAW_CAPABILITIES: TransportCapabilities = {
  rawEscPos: true,
  bold: true,
  underline: true,
  textSize: true,
  alignment: true,
  barcodes: true,
  qrcodes: true,
  images: true,
  cut: true,
  cashDrawer: true,
  requiresConfirmation: false,
  raster: false
}

/**
 * Build the share URI.
 *
 * Uses `buildIntentUri` rather than hand-concatenation, because the payload here is arbitrary
 * user text: a semicolon or a percent sign in a customer's name is entirely normal, and the
 * original library's string concatenation would have truncated the value at the first one.
 */
export function buildRawThermalShareUri(text: string, title?: string, fallbackUrl?: string): string {
  const extras: Record<string, string> = {
    'android.intent.extra.TEXT': text,
    'android.intent.extra.SUBJECT': title ?? DEFAULT_SHARE_TITLE
  }

  return buildIntentUri({
    action: 'android.intent.action.SEND',
    package: RAW_THERMAL_PACKAGE,
    type: 'text/plain',
    extras,
    ...(fallbackUrl === undefined ? {} : { fallbackUrl })
  })
}

/** Build the raw-bytes URI the patched app understands. */
export function buildRawThermalRawUri(bytes: Uint8Array, fallbackUrl?: string): string {
  return buildIntentUri({
    action: RAW_THERMAL_PRINT_RAW_ACTION,
    package: RAW_THERMAL_PACKAGE,
    extras: {
      // `base64,` prefix matches RawBT's `PRINT_RAWBT` convention, so anyone who has integrated
      // RawBT before recognises it immediately.
      [RAW_THERMAL_DATA_EXTRA]: `base64,${bytesToBase64(bytes)}`
    },
    ...(fallbackUrl === undefined ? {} : { fallbackUrl })
  })
}

/**
 * Print through Raw Thermal as shipped, by sharing text with it.
 *
 * The user has to tap Print in the app. That is not a limitation we can work around from a web
 * page: the app's own print screen is the only thing that talks to the printer.
 */
export class RawThermalShareTransport implements Transport {
  readonly id = 'rawthermal-share' as const
  readonly label = 'Raw Thermal (share)'
  readonly description =
    'Opens Raw Thermal with the receipt as text. You tap Print there. Bold, barcodes and cutting are not available.'
  readonly capabilities = RAW_THERMAL_SHARE_CAPABILITIES

  isSupported(): boolean {
    return detectEnvironment().canUseIntentUris
  }

  async send(request: PrintRequest): Promise<TransportOutcome> {
    const { output: text, warnings } = renderPlainText(request.document, {
      columns: request.columns
    })

    if (text.trim().length === 0) {
      return {
        ok: false,
        message: 'The document has no printable text, and this path can only send text.',
        warnings
      }
    }

    const uri = buildRawThermalShareUri(text, request.title, request.fallbackUrl)

    try {
      openIntentUri(uri)
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Could not open Raw Thermal',
        warnings,
        uri
      }
    }

    return {
      ok: true,
      message: 'Sent to Raw Thermal. Open it and tap Print.',
      warnings,
      uri
    }
  }
}

/**
 * Print raw ESC/POS through a patched Raw Thermal.
 *
 * `isSupported()` cannot verify the patch is present — a browser has no way to inspect an
 * installed app's intent filters. If the app is unpatched the launch simply does nothing, so the
 * caller should offer the share transport as the safe default and this one as an opt-in.
 */
export class RawThermalRawTransport implements Transport {
  readonly id = 'rawthermal-raw' as const
  readonly label = 'Raw Thermal (raw)'
  readonly description =
    'Sends the raw ESC/POS stream. Full formatting and cutting, but requires a Raw Thermal build that includes the PRINT_RAW receiver.'
  readonly capabilities = RAW_THERMAL_RAW_CAPABILITIES

  isSupported(): boolean {
    return detectEnvironment().canUseIntentUris
  }

  async send(request: PrintRequest): Promise<TransportOutcome> {
    const { output: bytes, warnings } = renderEscPos(request.document, {
      columns: request.columns
    })

    const uri = buildRawThermalRawUri(bytes, request.fallbackUrl)

    try {
      openIntentUri(uri)
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Could not open Raw Thermal',
        warnings,
        uri
      }
    }

    return {
      ok: true,
      message:
        'Sent to Raw Thermal as raw ESC/POS. If nothing happens, this build does not have the PRINT_RAW receiver yet.',
      warnings,
      uri
    }
  }
}
