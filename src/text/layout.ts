/**
 * Text layout for a fixed-width printer.
 *
 * A thermal printer has no layout engine: it has a character grid. Everything here works in
 * "columns", where one column is one character cell, and callers get the column count from the
 * paper width (see `paperColumns`).
 */

/**
 * Word-wrap text to a column count.
 *
 * Explicit newlines are honoured, and a word longer than the line is broken rather than allowed
 * to overflow — an overflowing line is silently truncated by most printers, which loses data.
 */
export function wrapText(text: string, columns: number): string[] {
  if (columns <= 0) return text.split(/\r\n|\r|\n/)

  const lines: string[] = []

  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    if (paragraph.length === 0) {
      lines.push('')
      continue
    }

    let current = ''
    // Splitting on runs of spaces keeps the spaces themselves out of the words, so a wrapped
    // line does not start with the space that used to separate two words.
    for (const word of paragraph.split(/ +/)) {
      if (word.length === 0) continue

      if (current.length === 0) {
        current = word
      } else if (current.length + 1 + word.length <= columns) {
        current = `${current} ${word}`
      } else {
        lines.push(current)
        current = word
      }

      while (current.length > columns) {
        lines.push(current.slice(0, columns))
        current = current.slice(columns)
      }
    }

    lines.push(current)
  }

  return lines
}

/** Pad a line to the full width and place `right` against the right edge. */
export function padBetween(left: string, right: string, columns: number): string {
  const gap = columns - left.length - right.length
  if (gap <= 0) return `${left}${right}`
  return `${left}${' '.repeat(gap)}${right}`
}

export function centerIn(text: string, columns: number): string {
  const padding = Math.max(0, Math.floor((columns - text.length) / 2))
  return `${' '.repeat(padding)}${text}`
}

export function alignRightIn(text: string, columns: number): string {
  return `${' '.repeat(Math.max(0, columns - text.length))}${text}`
}

export function horizontalRule(character = '-', columns = 32): string {
  const unit = character.length > 0 ? character : '-'
  return unit.repeat(Math.max(0, Math.floor(columns / unit.length)))
}

/**
 * Strip characters that would be interpreted as printer commands.
 *
 * Needed wherever user text is embedded in a stream that is already being interpreted — a
 * stray `0x1B` in a customer's name would otherwise swallow the bytes after it and produce a
 * printout nobody can explain.
 */
export function stripControlCharacters(text: string): string {
  // Tab and newline survive; everything else in the control range goes.
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
}

/** Column counts for the two paper widths thermal printers actually come in. */
export function paperColumns(widthMm: 58 | 80, font: 'a' | 'b' = 'a'): number {
  if (font === 'b') return widthMm === 58 ? 42 : 56
  return widthMm === 58 ? 32 : 48
}
