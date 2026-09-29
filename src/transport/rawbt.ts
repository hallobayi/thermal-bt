/**
 * The original RawBT hand-off, preserved byte for byte.
 *
 * RawBT is a paid Android app that registers the `rawbt` scheme. A web page hands it data with
 * a single `intent:` URI:
 *
 *     intent:base64,<base64 of the percent-escaped byte stream>#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;
 *
 * Two details are load-bearing and neither was documented in the original library:
 *
 * 1. The payload is base64 of a **percent-escaped** string (`ESC @` is the five characters
 *    `%1b%40`), not base64 of the raw bytes. RawBT un-escapes it.
 * 2. The data sits before `#Intent;` and is *not* percent-decoded by Android, so the base64 goes
 *    in untouched. Escaping it would corrupt the payload.
 *
 * This class is deliberately not built with `buildIntentUri`: that helper produces the canonical
 * escaped form, and changing a string that is known to work with an app we cannot test against
 * would be a gratuitous risk.
 */

import { renderEscPos } from '../document/renderEscPos.ts'
import { percentEscapeBytes } from './encoding.ts'
import { escapeIntentValue } from './intentUri.ts'
import { handOffIntentUri } from './intentHandoff.ts'
import { canUseIntentUris } from './platform.ts'
import type { PrintRequest, Transport, TransportCapabilities, TransportOutcome } from './types.ts'

export const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter'

export const RAWBT_CAPABILITIES: TransportCapabilities = {
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
 * Build the URI RawBT expects.
 *
 * Exported so it can be asserted in a test without a device, and so a caller can put it in an
 * `<a href>` themselves — the most reliable way to survive a browser that is strict about
 * user gestures.
 */
export function buildRawBtUri(bytes: Uint8Array, fallbackUrl?: string): string {
  // `btoa` on the escaped string rather than on the bytes: the escaped form is pure ASCII, which
  // is exactly what `btoa` accepts.
  const payload = `base64,${btoa(percentEscapeBytes(bytes))}`

  const items = ['scheme=rawbt', `package=${RAWBT_PACKAGE}`]
  if (fallbackUrl !== undefined) {
    items.push(`S.browser_fallback_url=${escapeIntentValue(fallbackUrl)}`)
  }

  return `intent:${payload}#Intent;${items.join(';')};end;`
}

export class RawBtTransport implements Transport {
  readonly id = 'rawbt' as const
  readonly label = 'RawBT'
  readonly description =
    'Hands the raw ESC/POS stream to the RawBT app. Full formatting, barcodes, cutting and the cash drawer.'
  readonly capabilities = RAWBT_CAPABILITIES

  isSupported(): boolean {
    return canUseIntentUris()
  }

  async send(request: PrintRequest): Promise<TransportOutcome> {
    const { output: bytes, warnings } = renderEscPos(request.document, {
      columns: request.columns
    })

    return handOffIntentUri({
      uri: buildRawBtUri(bytes, request.fallbackUrl),
      warnings,
      successMessage: 'Sent to RawBT. It should print immediately.',
      failureMessage: 'Could not open RawBT'
    })
  }
}
