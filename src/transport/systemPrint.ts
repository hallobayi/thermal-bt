/**
 * Print through Android's own print dialog, which Raw Thermal registers a `PrintService` with.
 *
 * This is the only path that produces a *styled* receipt from a web page without changing the
 * app: `window.print()` opens the system dialog, the user picks the printer, and Raw Thermal
 * renders the markup to an image and dithers it onto the paper.
 *
 * The trade-off is real and worth stating plainly: because the output is rasterised, the text is
 * no longer sharp, and cut, cash drawer, barcode and QR commands are all unavailable — a raster
 * image cannot trigger a cutter. It also costs far more bytes than the same receipt in text.
 */

import { renderHtml } from '../document/renderHtml.ts'
import { detectEnvironment } from './platform.ts'
import { printHtmlInIframe } from './platform.ts'
import type { PrintRequest, Transport, TransportCapabilities, TransportOutcome } from './types.ts'

export const SYSTEM_PRINT_CAPABILITIES: TransportCapabilities = {
  rawEscPos: false,
  bold: true,
  underline: true,
  textSize: true,
  alignment: true,
  barcodes: false,
  qrcodes: false,
  images: false,
  cut: false,
  cashDrawer: false,
  requiresConfirmation: true,
  raster: true
}

export class SystemPrintTransport implements Transport {
  readonly id = 'system-print' as const
  readonly label = 'System print dialog'
  readonly description =
    'Opens the Android print dialog and lets you pick Raw Thermal. Styled output, but printed as an image, with no cutting or drawer.'
  readonly capabilities = SYSTEM_PRINT_CAPABILITIES

  isSupported(): boolean {
    return detectEnvironment().canUseWindowPrint
  }

  async send(request: PrintRequest): Promise<TransportOutcome> {
    // A caller that already has markup — a web app printing its own page — should not have to
    // express its layout as a print document first.
    const rendered = request.html === undefined
      ? renderHtml(request.document, { columns: request.columns })
      : { output: request.html, warnings: [] as string[] }

    try {
      await printHtmlInIframe(rendered.output)
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Could not open the print dialog',
        warnings: rendered.warnings
      }
    }

    return {
      ok: true,
      message: 'The Android print dialog should be open. Pick your printer to continue.',
      warnings: rendered.warnings
    }
  }
}
