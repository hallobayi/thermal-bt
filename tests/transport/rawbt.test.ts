/**
 * The RawBT transport.
 *
 * The claim being tested is compatibility: the URI this library produces must be the same one the
 * original `rawbt-js-library` produced. RawBT is a closed app we cannot test against, and a
 * "tidier" URI is not worth the risk of breaking every existing integration.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrintDocument } from '../../src/document/PrintDocument.ts'
import { renderEscPos } from '../../src/document/renderEscPos.ts'
import { buildRawBtUri, RAWBT_PACKAGE } from '../../src/transport/rawbt.ts'
import { percentEscapeBytes } from '../../src/transport/encoding.ts'
import { parseIntentUri } from '../../src/transport/intentUri.ts'

/**
 * The original library, transcribed verbatim:
 *
 *     S = "#Intent;scheme=rawbt;";
 *     P = "package=ru.a402d.rawbtprinter;end;";
 *     textEncoded = "base64," + btoa(unescape(prn));
 *     window.location.href = "intent:" + textEncoded + S + P;
 */
function originalRawBtUri(percentEscapedStream: string): string {
  return (
    'intent:' +
    'base64,' +
    btoa(percentEscapedStream) +
    '#Intent;scheme=rawbt;' +
    'package=ru.a402d.rawbtprinter;end;'
  )
}

describe('buildRawBtUri', () => {
  it('matches the original library byte for byte', () => {
    // `ESC @` -> "%1b%40", which is exactly what the original's `chr()` produced (lowercase hex).
    const bytes = new Uint8Array([0x1b, 0x40])
    assert.equal(buildRawBtUri(bytes), originalRawBtUri('%1b%40'))
  })

  it('matches the original for a realistic receipt stream', () => {
    const job = new PrintDocument({ columns: 16 })
    job.initialize().center().bold(true).line('TOKO').bold(false).cut()
    job.feed(2).openDrawer()

    const bytes = renderEscPos(job).output
    assert.equal(buildRawBtUri(bytes), originalRawBtUri(percentEscapeBytes(bytes)))
  })

  it('base64-encodes the escaped text, not the raw bytes', () => {
    // Getting this backwards is the classic RawBT integration bug: the printer then prints the
    // literal text "%1b%40" instead of resetting.
    const uri = buildRawBtUri(new Uint8Array([0x1b, 0x40]))
    assert.ok(uri.includes(`base64,${btoa('%1b%40')}`))

    const payload = uri.slice('intent:'.length, uri.indexOf('#Intent;'))
    assert.equal(atob(payload.slice('base64,'.length)), '%1b%40')
  })

  it('uses lowercase hex, as the original did', () => {
    assert.ok(buildRawBtUri(new Uint8Array([0xab])).includes(btoa('%ab')))
  })

  it('puts the payload before the fragment and leaves it unescaped', () => {
    // Android does not percent-decode the data part, so escaping the base64 would corrupt it.
    const parsed = parseIntentUri(buildRawBtUri(new Uint8Array([0x1b, 0x40])))

    assert.equal(parsed.data, `base64,${btoa('%1b%40')}`)
    assert.equal(parsed.scheme, 'rawbt')
    assert.equal(parsed.package, RAWBT_PACKAGE)
  })

  it('appends a fallback URL only when asked', () => {
    assert.ok(!buildRawBtUri(new Uint8Array([0x41])).includes('browser_fallback_url'))

    const parsed = parseIntentUri(
      buildRawBtUri(new Uint8Array([0x41]), 'https://example.com/app')
    )
    assert.equal(parsed.extras['browser_fallback_url'], 'https://example.com/app')
  })

  it('handles an empty stream without producing a broken URI', () => {
    assert.equal(
      buildRawBtUri(new Uint8Array([])),
      'intent:base64,#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;'
    )
  })
})
