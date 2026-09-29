/**
 * Render a print document as plain text.
 *
 * This exists because of a hard constraint in Raw Thermal's current Android build: the only way
 * a web page can hand it a document is the `text/plain` share path, and that path ends in
 * `printTextDocument()` -> `encoder.textBlock()`, which re-wraps the text to the paper width and
 * re-encodes it through the app's own code page.
 *
 * The consequence is blunt: a raw ESC/POS byte stream sent that way does not survive. The `ESC`
 * control byte is not in the code page table, so it becomes `?`, and the app's own line wrapping
 * inserts breaks in the middle of command sequences. So for this transport the document has to be
 * rendered down to text instead — and the honest thing is to say which parts of it were dropped.
 */

import { alignRightIn, centerIn, horizontalRule, stripControlCharacters, wrapText } from '../text/layout.ts'
import type { Alignment } from '../escpos/commands.ts'
import type { PrintDocument } from './PrintDocument.ts'
import type { RenderOutput } from './renderEscPos.ts'
import type { PrintOperation } from './operations.ts'

export interface PlainTextRenderOptions {
  /** Overrides the document's paper width. */
  columns?: number | undefined
}

export function renderPlainText(
  document: PrintDocument,
  options: PlainTextRenderOptions = {}
): RenderOutput<string> {
  const columns = options.columns ?? document.columns
  const lines: string[] = []
  const warnings = new Set<string>()

  let pending = ''
  let pendingAlign: Alignment = 'left'
  let currentAlign: Alignment = 'left'

  function flush(): void {
    if (pending.length === 0) return
    lines.push(alignLine(pending, pendingAlign, columns))
    pending = ''
    pendingAlign = 'left'
  }

  function append(value: string): void {
    const clean = stripControlCharacters(value)
    if (pending.length === 0) pendingAlign = currentAlign
    pending += clean
  }

  function blank(count: number): void {
    for (let index = 0; index < count; index++) lines.push('')
  }

  for (const operation of document.ops) {
    switch (operation.kind) {
      case 'initialize':
        break

      case 'codepage':
        warnings.add(
          'The receiving app chooses the code page from its own settings; this job\'s code page is ignored.'
        )
        break

      case 'align':
        flush()
        currentAlign = operation.align
        break

      case 'bold':
        if (operation.on) warnings.add('Bold is not available on this path.')
        break

      case 'underline':
        if (operation.mode !== 0) warnings.add('Underline is not available on this path.')
        break

      case 'fontSize':
        if (operation.size !== 'normal') warnings.add('Text size is not available on this path.')
        break

      case 'printMode':
        if (operation.mode !== 0) warnings.add('Raw print modes are not available on this path.')
        break

      case 'text':
        append(operation.value)
        break

      case 'line':
        append(operation.value)
        flush()
        break

      case 'textBlock':
        flush()
        for (const wrapped of wrapText(stripControlCharacters(operation.value), columns)) {
          lines.push(alignLine(wrapped, currentAlign, columns))
        }
        break

      case 'newline':
        flush()
        blank(Math.max(0, operation.count - 1))
        break

      case 'rule':
        flush()
        lines.push(horizontalRule(operation.character, operation.columns ?? columns))
        break

      case 'keyValue':
        flush()
        lines.push(padKeyValue(operation.label, operation.value, operation.columns ?? columns))
        break

      case 'feed':
        flush()
        // One line was already consumed by ending the current line, exactly as `ESC d n` does.
        blank(Math.max(0, operation.lines - 1))
        break

      case 'feedForm':
      case 'release':
      case 'feedReverse':
        warnings.add('Paper movement commands are not available on this path.')
        break

      case 'cut':
        warnings.add('Paper cutting is controlled by the receiving app\'s own settings.')
        break

      case 'drawer':
        warnings.add('The cash drawer cannot be opened on this path.')
        break

      case 'barcode':
        flush()
        warnings.add('Barcodes cannot be sent as text; the content is printed instead.')
        lines.push(`[${operation.type.toUpperCase()}] ${operation.content}`)
        break

      case 'qrcode':
        flush()
        warnings.add('QR codes cannot be sent as text; the content is printed instead.')
        lines.push(`[QR] ${operation.content}`)
        break

      case 'image':
        flush()
        warnings.add('Images cannot be sent as text and were dropped.')
        break

      case 'raw':
        flush()
        warnings.add(
          'Raw ESC/POS bytes were dropped: this path re-encodes everything as text, so the bytes would be corrupted rather than printed.'
        )
        break

      default:
        assertNever(operation)
    }
  }

  flush()

  return { output: lines.join('\n'), warnings: [...warnings] }
}

function alignLine(line: string, align: Alignment, columns: number): string {
  // Only ever padded on the left. Trailing spaces are the one thing a wrapping receiver can
  // turn into an extra line, so a left-aligned line is emitted exactly as it is.
  if (align === 'center') return centerIn(line, columns)
  if (align === 'right') return alignRightIn(line, columns)
  return line
}

function padKeyValue(label: string, value: string, columns: number): string {
  const gap = columns - label.length - value.length
  if (gap >= 1) return `${label}${' '.repeat(gap)}${value}`
  return `${label}\n${alignRightIn(value, columns)}`
}

function assertNever(value: never): never {
  throw new Error(`Unhandled print operation: ${JSON.stringify(value)}`)
}
