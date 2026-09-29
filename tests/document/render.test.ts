/**
 * The three renderers, driven by the same document.
 *
 * The point of these tests is the claim the rewrite rests on: one job, three faithful-enough
 * outputs, and every dropped feature reported rather than silently lost.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrintDocument } from '../../src/document/PrintDocument.ts'
import { renderEscPos } from '../../src/document/renderEscPos.ts'
import { renderPlainText } from '../../src/document/renderPlainText.ts'
import { renderHtml } from '../../src/document/renderHtml.ts'
import { assertBytes } from '../support/bytes.ts'

describe('renderEscPos', () => {
  it('renders a small receipt to the expected bytes', () => {
    const job = new PrintDocument({ columns: 16 })
    job.initialize().center().line('HI').left().cut()

    assertBytes(renderEscPos(job).output, [
      0x1b, 0x40, // initialize
      0x1b, 0x61, 0x01, // centre
      0x48, 0x49, 0x0a, // "HI" + LF
      0x1b, 0x61, 0x00, // left
      0x1d, 0x56, 0x41, 0x03 // cut, 3 lines
    ])
  })

  it('expands a rule to the document width', () => {
    const job = new PrintDocument({ columns: 8 })
    job.rule('-')
    assertBytes(renderEscPos(job).output, [...'-'.repeat(8)].map((character) => character.charCodeAt(0)).concat(0x0a))
  })

  it('lets the caller override the width', () => {
    const job = new PrintDocument({ columns: 8 })
    job.rule('-')
    assert.equal(renderEscPos(job, { columns: 4 }).output.length, 5)
  })

  it('expands keyValue to the document width', () => {
    const job = new PrintDocument({ columns: 12 })
    job.keyValue('A', '1')
    const text = String.fromCharCode(...renderEscPos(job).output)
    assert.equal(text, 'A          1\n')
  })

  it('applies the code page to text and reports what it could not encode', () => {
    const job = new PrintDocument()
    job.text('é中')

    const { output } = renderEscPos(job, { codepage: 'cp437' })
    assertBytes(output, [0x82, 0x3f])
  })

  it('encodes a code page change as a command', () => {
    const job = new PrintDocument()
    job.codepage('cp866')
    assertBytes(renderEscPos(job).output, [0x1c, 0x2e, 0x1b, 0x74, 0x11])
  })

  it('reports no warnings, because ESC/POS can express everything', () => {
    const job = new PrintDocument()
    job.initialize().bold().qrcode('x').cut().openDrawer()
    assert.deepEqual(renderEscPos(job).warnings, [])
  })

  it('passes raw bytes through untouched', () => {
    const job = new PrintDocument()
    job.raw([0x1b, 0x70, 0x00, 0x19, 0xfa])
    assertBytes(renderEscPos(job).output, [0x1b, 0x70, 0x00, 0x19, 0xfa])
  })
})

describe('renderPlainText', () => {
  it('centres with leading spaces, which a wrapping receiver keeps', () => {
    const job = new PrintDocument({ columns: 10 })
    job.center().line('HI')
    assert.equal(renderPlainText(job).output, '    HI')
  })

  it('never pads on the right', () => {
    // Trailing spaces are the one thing a receiver that re-wraps can turn into an extra line.
    const job = new PrintDocument({ columns: 20 })
    job.line('short')
    assert.equal(renderPlainText(job).output, 'short')
  })

  it('right-aligns a line', () => {
    const job = new PrintDocument({ columns: 10 })
    job.right().line('HI')
    assert.equal(renderPlainText(job).output, '        HI')
  })

  it('prints a QR placeholder and says so', () => {
    const job = new PrintDocument({ columns: 20 })
    job.qrcode('INV-1')
    const { output, warnings } = renderPlainText(job)

    assert.equal(output, '[QR] INV-1')
    assert.deepEqual(warnings, ['QR codes cannot be sent as text; the content is printed instead.'])
  })

  it('drops raw ESC/POS bytes and explains why', () => {
    // Silently sending them would corrupt the stream, because the receiver re-encodes everything
    // through its own code page and wraps the text.
    const job = new PrintDocument()
    job.raw([0x1b, 0x40])

    const { output, warnings } = renderPlainText(job)
    assert.equal(output, '')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0] ?? '', /Raw ESC\/POS bytes were dropped/)
  })

  it('reports each dropped feature once, however often it is used', () => {
    const job = new PrintDocument()
    job.bold().line('a').bold().line('b').bold().line('c')

    const { warnings } = renderPlainText(job)
    assert.deepEqual(warnings, ['Bold is not available on this path.'])
  })

  it('removes control characters so a stray ESC cannot eat the next line', () => {
    const job = new PrintDocument()
    job.line('a\u001bb')
    assert.equal(renderPlainText(job).output, 'ab')
  })

  it('renders a rule and a keyValue pair', () => {
    const job = new PrintDocument({ columns: 10 })
    job.rule('=').keyValue('Coffee', '25')
    assert.equal(renderPlainText(job).output, '==========\nCoffee  25')
  })

  it('turns a newline into a line break', () => {
    const job = new PrintDocument()
    job.line('a').line('b')
    assert.equal(renderPlainText(job).output, 'a\nb')
  })

  it('emits n-1 blank lines for a feed of n, matching ESC d n', () => {
    // `ESC d n` advances n lines, one of which is spent ending the current line.
    const job = new PrintDocument()
    job.line('a').feed(3)
    assert.equal(renderPlainText(job).output, 'a\n\n')
  })
})

describe('renderHtml', () => {
  it('escapes markup in the content', () => {
    const job = new PrintDocument()
    job.line('<script>alert(1)</script>')

    const html = renderHtml(job).output
    assert.ok(!html.includes('<script>alert(1)</script>'))
    assert.ok(html.includes('&lt;script&gt;'))
  })

  it('sizes the page in columns so monospace lines land in the right grid', () => {
    const job = new PrintDocument({ columns: 42 })
    assert.ok(renderHtml(job).output.includes('width: 42ch'))
  })

  it('renders a rule as a real element', () => {
    const job = new PrintDocument()
    job.rule()
    assert.ok(renderHtml(job).output.includes('<hr'))
  })

  it('reports the features a raster image cannot carry', () => {
    const job = new PrintDocument()
    job.qrcode('x').cut().openDrawer().image([0xff], 8, 1)

    const { warnings } = renderHtml(job)
    assert.equal(warnings.length, 4)
    assert.ok(warnings.some((warning) => warning.includes('QR codes')))
    assert.ok(warnings.some((warning) => warning.includes('Cutting')))
    assert.ok(warnings.some((warning) => warning.includes('cash drawer')))
    assert.ok(warnings.some((warning) => warning.includes('Images')))
  })
})

describe('one document, three outputs', () => {
  it('renders the same job three different ways', () => {
    const job = new PrintDocument({ columns: 12 })
    job.initialize().center().bold(true).line('TOKO').bold(false).left()
    job.keyValue('Kopi', '25.000').qrcode('INV-1')

    const escpos = renderEscPos(job).output
    const text = renderPlainText(job).output
    const html = renderHtml(job).output

    // The ESC/POS path keeps everything, so it has no warnings.
    assert.deepEqual(renderEscPos(job).warnings, [])
    assert.ok(escpos.length > 0)

    // The text path keeps the layout and the QR content, and admits what it lost.
    assert.equal(text, '    TOKO\nKopi  25.000\n[QR] INV-1')
    assert.equal(renderPlainText(job).warnings.length, 2)

    // The HTML path is markup, and reports the QR it had to flatten.
    assert.ok(html.startsWith('<!doctype html>'))
    assert.equal(renderHtml(job).warnings.length, 1)
  })
})
