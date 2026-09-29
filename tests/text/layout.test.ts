/**
 * Fixed-width layout helpers.
 *
 * These decide whether a receipt lines up. A printer has no layout engine — it has a character
 * grid — so the arithmetic here is the whole of the layout.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  alignRightIn,
  centerIn,
  horizontalRule,
  padBetween,
  paperColumns,
  stripControlCharacters,
  wrapText
} from '../../src/text/layout.ts'

describe('wrapText', () => {
  it('wraps on spaces', () => {
    assert.deepEqual(wrapText('one two three four', 9), ['one two', 'three', 'four'])
  })

  it('keeps a line that exactly fills the width', () => {
    assert.deepEqual(wrapText('abcde fghij', 11), ['abcde fghij'])
  })

  it('honours explicit newlines and keeps blank lines', () => {
    assert.deepEqual(wrapText('a\n\nb', 10), ['a', '', 'b'])
  })

  it('handles CRLF and lone CR', () => {
    assert.deepEqual(wrapText('a\r\nb\rc', 10), ['a', 'b', 'c'])
  })

  it('breaks a word that cannot fit', () => {
    // Letting it overflow instead would lose data: most printers truncate a long line silently.
    assert.deepEqual(wrapText('abcdefghij', 4), ['abcd', 'efgh', 'ij'])
  })

  it('carries the tail of a long word into the next line', () => {
    assert.deepEqual(wrapText('abcdefghij klm', 4), ['abcd', 'efgh', 'ij', 'klm'])
  })

  it('does not start a wrapped line with a space', () => {
    for (const line of wrapText('alpha beta gamma delta', 8)) {
      assert.ok(!line.startsWith(' '), `line starts with a space: ${JSON.stringify(line)}`)
    }
  })

  it('preserves a line of only spaces as a blank line', () => {
    assert.deepEqual(wrapText('a\n   \nb', 10), ['a', '', 'b'])
  })

  it('treats a non-positive width as no wrapping', () => {
    assert.deepEqual(wrapText('a b c', 0), ['a b c'])
  })

  it('handles empty input', () => {
    assert.deepEqual(wrapText('', 10), [''])
  })
})

describe('alignment padding', () => {
  it('pads between two parts', () => {
    assert.equal(padBetween('Coffee', '25.000', 16), 'Coffee    25.000')
  })

  it('does not lose characters when there is no room', () => {
    // Better to overflow than to silently drop the price.
    assert.equal(padBetween('A very long label', '999.999', 10), 'A very long label999.999')
  })

  it('centres', () => {
    assert.equal(centerIn('HI', 10), '    HI')
    assert.equal(centerIn('1234567890', 10), '1234567890')
  })

  it('right-aligns', () => {
    assert.equal(alignRightIn('HI', 10), '        HI')
    assert.equal(alignRightIn('12345678901', 10), '12345678901')
  })
})

describe('horizontalRule', () => {
  it('repeats to the column count', () => {
    assert.equal(horizontalRule('-', 10), '----------')
  })

  it('never overflows with a multi-character unit', () => {
    assert.equal(horizontalRule('=-', 9), '=-=-=-=-')
  })

  it('falls back to a dash when given an empty unit', () => {
    assert.equal(horizontalRule('', 4), '----')
  })

  it('handles zero width', () => {
    assert.equal(horizontalRule('-', 0), '')
  })
})

describe('stripControlCharacters', () => {
  it('removes ESC so a stray one cannot swallow the following bytes', () => {
    assert.equal(stripControlCharacters('a\u001bb'), 'ab')
  })

  it('keeps tabs and newlines', () => {
    assert.equal(stripControlCharacters('a\tb\nc'), 'a\tb\nc')
  })

  it('removes NUL and DEL', () => {
    assert.equal(stripControlCharacters('a\u0000b\u007fc'), 'abc')
  })

  it('leaves ordinary text alone', () => {
    assert.equal(stripControlCharacters('Rp 25.000 — Nasi Goreng'), 'Rp 25.000 — Nasi Goreng')
  })
})

describe('paperColumns', () => {
  it('knows the two paper widths', () => {
    assert.equal(paperColumns(58), 32)
    assert.equal(paperColumns(80), 48)
  })

  it('gives the condensed font more columns', () => {
    assert.equal(paperColumns(58, 'b'), 42)
    assert.equal(paperColumns(80, 'b'), 56)
  })
})
