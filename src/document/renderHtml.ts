/**
 * Render a print document as HTML, for the Android print dialog.
 *
 * This is the raster path: Android hands the markup to Raw Thermal's `PrintService`, which
 * renders it to an image and dithers it onto the paper. Nothing here reaches the printer as
 * characters, which is exactly why it is the only way to get a *styled* receipt out of a web
 * page without changing the app.
 *
 * Sizing uses `ch` units against a monospace font. That is not a stylistic choice: `32ch` is
 * genuinely 32 characters wide, so a receipt laid out for 58 mm paper lands in the same columns
 * it would if it had been printed as text.
 */

import { escapeHtml } from '../text/html.ts'
import type { PrintDocument } from './PrintDocument.ts'
import type { RenderOutput } from './renderEscPos.ts'
import type { PrintOperation } from './operations.ts'

export interface HtmlRenderOptions {
  columns?: number | undefined
  /** Point size for the normal font. Everything else scales from it. */
  fontSizePt?: number | undefined
}

/** Font sizes the ESC/POS presets map onto, in `em` relative to the normal size. */
const SIZE_SCALE = {
  normal: 1,
  small: 0.8,
  tall: 2,
  wide: 2,
  large: 2
} as const

export function renderHtml(
  document: PrintDocument,
  options: HtmlRenderOptions = {}
): RenderOutput<string> {
  const columns = options.columns ?? document.columns
  const basePt = options.fontSizePt ?? 10
  const warnings = new Set<string>()

  const blocks: string[] = []
  let align: 'left' | 'center' | 'right' = 'left'
  let bold = false
  let underline = false
  let scale: number = SIZE_SCALE.normal

  function style(): string {
    const parts = [
      `text-align:${align}`,
      `font-size:${(basePt * scale).toFixed(2)}pt`,
      'margin:0',
      'white-space:pre-wrap',
      'word-break:break-word'
    ]
    if (bold) parts.push('font-weight:700')
    if (underline) parts.push('text-decoration:underline')
    return parts.join(';')
  }

  function block(content: string, extra = ''): void {
    blocks.push(`<div style="${style()}${extra}">${content}</div>`)
  }

  function spacer(lines: number): void {
    if (lines <= 0) return
    blocks.push(`<div style="height:${(basePt * 1.2 * lines).toFixed(2)}pt"></div>`)
  }

  for (const operation of document.ops) {
    switch (operation.kind) {
      case 'initialize':
        break

      case 'codepage':
        warnings.add(
          'The code page is chosen by the printer; on this path the text is rasterised, so it is not applied.'
        )
        break

      case 'align':
        align = operation.align
        break

      case 'bold':
        bold = operation.on
        break

      case 'underline':
        underline = operation.mode !== 0
        break

      case 'fontSize':
        scale = SIZE_SCALE[operation.size]
        break

      case 'printMode':
        warnings.add('Raw print modes have no HTML equivalent.')
        break

      case 'text':
        block(escapeHtml(operation.value), ';display:inline-block')
        break

      case 'line':
        block(escapeHtml(operation.value))
        break

      case 'textBlock':
        block(escapeHtml(operation.value))
        break

      case 'newline':
        spacer(operation.count)
        break

      case 'rule':
        blocks.push('<hr style="border:0;border-top:1px solid #000;margin:2pt 0">')
        break

      case 'keyValue': {
        const width = operation.columns ?? columns
        // A real flex row rather than padded spaces: the browser aligns it exactly, and it
        // stays aligned even when the font metrics are not what we assumed.
        const gap = width - operation.label.length - operation.value.length
        if (gap >= 1) {
          blocks.push(
            `<div style="${style()};display:flex;justify-content:space-between">` +
              `<span>${escapeHtml(operation.label)}</span><span>${escapeHtml(operation.value)}</span></div>`
          )
        } else {
          block(escapeHtml(operation.label))
          block(escapeHtml(operation.value), ';text-align:right')
        }
        break
      }

      case 'feed':
        spacer(operation.lines)
        break

      case 'feedForm':
      case 'release':
      case 'feedReverse':
        warnings.add('Paper movement commands have no HTML equivalent.')
        break

      case 'cut':
        warnings.add('Cutting is controlled by the app; the print service cannot trigger a cutter.')
        break

      case 'drawer':
        warnings.add('The cash drawer cannot be opened on this path.')
        break

      case 'barcode':
        warnings.add('Barcodes are printed as text on this path.')
        block(escapeHtml(`[${operation.type.toUpperCase()}] ${operation.content}`))
        break

      case 'qrcode':
        warnings.add('QR codes are printed as text on this path.')
        block(escapeHtml(`[QR] ${operation.content}`))
        break

      case 'image':
        warnings.add('Images are not rendered on this path.')
        break

      case 'raw':
        warnings.add('Raw ESC/POS bytes are dropped: this path rasterises markup.')
        break

      default:
        assertNever(operation)
    }
  }

  const html = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    '<style>',
    '  @page { margin: 0; }',
    '  html, body { margin: 0; padding: 0; }',
    `  body { width: ${columns}ch; font-family: "Courier New", ui-monospace, monospace; line-height: 1.2; color: #000; background: #fff; }`,
    '</style>',
    '</head><body>',
    ...blocks,
    '</body></html>'
  ].join('\n')

  return { output: html, warnings: [...warnings] }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled print operation: ${JSON.stringify(value)}`)
}
