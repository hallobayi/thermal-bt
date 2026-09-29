/**
 * Render a print document to ESC/POS bytes.
 *
 * The switch is exhaustive on purpose: `assertNever` turns "someone added an operation and
 * forgot this renderer" into a compile error instead of a silently dropped receipt line.
 */

import { EscPosEncoder } from '../escpos/EscPosEncoder.ts'
import type { CodepageNumbering } from '../escpos/codepages.ts'
import { horizontalRule } from '../text/layout.ts'
import { assertNever } from './exhaustive.ts'
import type { PrintDocument } from './PrintDocument.ts'
import type { PrintOperation } from './operations.ts'

export interface RenderOutput<T> {
  output: T
  /** Everything the renderer could not represent faithfully, in plain language. */
  warnings: string[]
}

export interface EscPosRenderOptions {
  codepage?: string | undefined
  numbering?: CodepageNumbering | undefined
  /** Overrides the document's paper width. */
  columns?: number | undefined
}

export function renderEscPos(
  document: PrintDocument,
  options: EscPosRenderOptions = {}
): RenderOutput<Uint8Array> {
  const columns = options.columns ?? document.columns
  const encoder = new EscPosEncoder({
    codepage: options.codepage,
    numbering: options.numbering
  })

  for (const operation of document.ops) {
    applyOperation(encoder, operation, columns)
  }

  return { output: encoder.encode(), warnings: [] }
}

function applyOperation(encoder: EscPosEncoder, operation: PrintOperation, columns: number): void {
  switch (operation.kind) {
    case 'initialize':
      encoder.initialize()
      return

    case 'codepage':
      encoder.codepage(operation.codepage)
      return

    case 'align':
      encoder.align(operation.align)
      return

    case 'bold':
      encoder.bold(operation.on)
      return

    case 'underline':
      encoder.underline(operation.mode)
      return

    case 'fontSize':
      encoder.fontSize(operation.size)
      return

    case 'printMode':
      encoder.printMode(operation.mode)
      return

    case 'text':
      encoder.text(operation.value)
      return

    case 'line':
      encoder.line(operation.value)
      return

    case 'textBlock':
      encoder.textBlock(operation.value, columns)
      return

    case 'newline':
      encoder.newline(operation.count)
      return

    case 'rule':
      encoder.line(horizontalRule(operation.character, operation.columns ?? columns))
      return

    case 'keyValue':
      encoder.keyValue(operation.label, operation.value, operation.columns ?? columns)
      return

    case 'feed':
      encoder.feed(operation.lines)
      return

    case 'feedForm':
      encoder.feedForm()
      return

    case 'release':
      encoder.release()
      return

    case 'feedReverse':
      encoder.feedReverse(operation.lines)
      return

    case 'cut':
      encoder.cut(operation.mode, operation.lines)
      return

    case 'drawer':
      encoder.openDrawer(operation.pin, operation.onTime, operation.offTime)
      return

    case 'barcode':
      encoder.barcode(operation.content, operation.type, operation.options)
      return

    case 'qrcode':
      encoder.qrcode(operation.content, operation.options)
      return

    case 'image':
      encoder.image(operation.data, operation.width, operation.height)
      return

    case 'raw':
      encoder.raw(operation.bytes)
      return

    default:
      return assertNever(operation)
  }
}
