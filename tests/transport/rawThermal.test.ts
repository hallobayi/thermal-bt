/**
 * The two Raw Thermal transports.
 *
 * `buildRawThermalShareUri` and `buildRawThermalRawUri` are pure, so the whole hand-off can be
 * asserted here. What cannot be asserted — and is stated plainly in the docs — is whether the
 * installed app accepts it. That needs a phone.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrintDocument } from '../../src/document/PrintDocument.ts'
import { renderEscPos } from '../../src/document/renderEscPos.ts'
import { base64ToBytes } from '../../src/transport/encoding.ts'
import { parseIntentUri } from '../../src/transport/intentUri.ts'
import {
  buildRawThermalRawUri,
  buildRawThermalShareUri,
  DEFAULT_SHARE_TITLE,
  RAW_THERMAL_DATA_EXTRA,
  RAW_THERMAL_PACKAGE,
  RAW_THERMAL_PRINT_RAW_ACTION,
  RawThermalRawTransport,
  RawThermalShareTransport
} from '../../src/transport/rawThermal.ts'

describe('buildRawThermalShareUri', () => {
  it('targets the app with an ACTION_SEND of text/plain', () => {
    // The app's manifest declares exactly this filter, so this is the hand-off that works with
    // the build that is already installed.
    const parsed = parseIntentUri(buildRawThermalShareUri('hello'))

    assert.equal(parsed.action, 'android.intent.action.SEND')
    assert.equal(parsed.package, RAW_THERMAL_PACKAGE)
    assert.equal(parsed.type, 'text/plain')
    assert.equal(parsed.extras['android.intent.extra.TEXT'], 'hello')
  })

  it('names the document, because the app derives a file name from the subject', () => {
    const parsed = parseIntentUri(buildRawThermalShareUri('hello', 'receipt.txt'))
    assert.equal(parsed.extras['android.intent.extra.SUBJECT'], 'receipt.txt')
  })

  it('falls back to a sensible default name', () => {
    const parsed = parseIntentUri(buildRawThermalShareUri('hello'))
    assert.equal(parsed.extras['android.intent.extra.SUBJECT'], DEFAULT_SHARE_TITLE)
  })

  it('survives a receipt full of characters that break naive concatenation', () => {
    const text = 'TOKO; 10% off; a=b; #1\nKopi 25.000\n☕ café 日本語'
    const parsed = parseIntentUri(buildRawThermalShareUri(text))
    assert.equal(parsed.extras['android.intent.extra.TEXT'], text)
  })

  it('passes the fallback URL through as the extra Chrome reads', () => {
    const parsed = parseIntentUri(
      buildRawThermalShareUri('x', 'y', 'https://example.com/install')
    )
    assert.equal(parsed.extras['browser_fallback_url'], 'https://example.com/install')
  })
})

describe('buildRawThermalRawUri', () => {
  it('uses the PRINT_RAW action the Android patch adds', () => {
    const parsed = parseIntentUri(buildRawThermalRawUri(new Uint8Array([0x1b, 0x40])))

    assert.equal(parsed.action, RAW_THERMAL_PRINT_RAW_ACTION)
    assert.equal(parsed.package, RAW_THERMAL_PACKAGE)
    assert.equal(parsed.extras[RAW_THERMAL_DATA_EXTRA], `base64,${btoa(String.fromCharCode(0x1b, 0x40))}`)
  })

  it('carries the raw bytes, not a percent-escaped rendering of them', () => {
    // The opposite convention from RawBT. Mixing them up is what makes a printer spit out
    // "%1b%40" as text, so the two paths are asserted separately on purpose.
    const bytes = renderEscPos(
      new PrintDocument().initialize().line('HI')
    ).output

    const parsed = parseIntentUri(buildRawThermalRawUri(bytes))
    const value = parsed.extras[RAW_THERMAL_DATA_EXTRA] ?? ''

    assert.ok(value.startsWith('base64,'))
    assert.deepEqual([...base64ToBytes(value.slice('base64,'.length))], [...bytes])
    assert.ok(!value.includes('%1b'))
  })

  it('round-trips a large payload without a RangeError', () => {
    // 200,000 bytes is past the argument-count limit that a naive `String.fromCharCode(...bytes)`
    // hits, which is why the encoder chunks.
    const bytes = new Uint8Array(200_000).map((_, index) => index & 0xff)
    const parsed = parseIntentUri(buildRawThermalRawUri(bytes))
    const value = parsed.extras[RAW_THERMAL_DATA_EXTRA] ?? ''

    assert.equal(base64ToBytes(value.slice('base64,'.length)).length, 200_000)
  })

  it('appends a fallback URL only when asked', () => {
    assert.ok(!buildRawThermalRawUri(new Uint8Array([0x41])).includes('browser_fallback_url'))
  })
})

describe('capabilities', () => {
  it('says the share path cannot carry raw ESC/POS', () => {
    // This is the finding the whole transport design rests on: the app's text path re-wraps and
    // re-encodes, so a byte stream cannot survive it.
    const capabilities = new RawThermalShareTransport().capabilities

    assert.equal(capabilities.rawEscPos, false)
    assert.equal(capabilities.barcodes, false)
    assert.equal(capabilities.cut, false)
    assert.equal(capabilities.cashDrawer, false)
    assert.equal(capabilities.requiresConfirmation, true)
    // Alignment survives, because it is expressed as leading spaces in monospace text.
    assert.equal(capabilities.alignment, true)
  })

  it('says the raw path can carry everything', () => {
    const capabilities = new RawThermalRawTransport().capabilities

    assert.equal(capabilities.rawEscPos, true)
    assert.equal(capabilities.barcodes, true)
    assert.equal(capabilities.cut, true)
    assert.equal(capabilities.cashDrawer, true)
    assert.equal(capabilities.requiresConfirmation, false)
  })

  it('exposes stable ids and labels', () => {
    assert.equal(new RawThermalShareTransport().id, 'rawthermal-share')
    assert.equal(new RawThermalRawTransport().id, 'rawthermal-raw')
  })
})
