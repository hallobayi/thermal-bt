/**
 * Intent URI escaping, verified against the rules Android's own parser follows.
 *
 * `parseIntentUri` in the source under test is a faithful re-implementation of the AOSP
 * `#Intent;` fragment loop, so these tests prove the escaping is correct without needing a
 * device. The important cases are the ones that silently corrupt a payload: a semicolon ends a
 * value, a percent sign starts an escape, and a `#Intent;` inside the data moves the fragment.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildIntentUri, escapeIntentValue, parseIntentUri } from '../../src/transport/intentUri.ts'

/** Every character a naive string concatenation gets wrong, plus real text. */
const HOSTILE_VALUES = [
  'plain',
  'semicolons; everywhere; here',
  'percent % and %41 and %zz',
  'hashes # and ## and #Intent;not really',
  'equals = signs = everywhere',
  'ampersands & pipes | and ? marks',
  'newlines\nand\r\ncarriage returns',
  'plus + signs + plus',
  'quotes "double" and \'single\'',
  'unicode: café, naïve, Straße, 日本語, العربية',
  'emoji: 🧾 🖨️',
  'backslashes \\ and slashes / and colons :',
  ''
]

describe('escapeIntentValue', () => {
  it('round-trips every hostile value through the parser', () => {
    for (const value of HOSTILE_VALUES) {
      const uri = buildIntentUri({
        action: 'android.intent.action.SEND',
        extras: { 'android.intent.extra.TEXT': value }
      })

      const parsed = parseIntentUri(uri)
      assert.equal(
        parsed.extras['android.intent.extra.TEXT'],
        value,
        `value did not survive: ${JSON.stringify(value)}`
      )
    }
  })

  it('escapes the characters that would break the grammar', () => {
    assert.equal(escapeIntentValue(';'), '%3B')
    assert.equal(escapeIntentValue('%'), '%25')
    assert.equal(escapeIntentValue('#'), '%23')
    assert.equal(escapeIntentValue('='), '%3D')
    assert.equal(escapeIntentValue('\n'), '%0A')
    assert.equal(escapeIntentValue(' '), '%20')
  })

  it('leaves the unreserved set alone so URIs stay readable', () => {
    assert.equal(escapeIntentValue('android.intent.extra.TEXT'), 'android.intent.extra.TEXT')
    assert.equal(escapeIntentValue('a-b_c.d~e'), 'a-b_c.d~e')
    assert.equal(escapeIntentValue('0123456789'), '0123456789')
  })

  it('escapes non-ASCII as UTF-8 bytes, which is what Uri.decode expects', () => {
    // Uri.decode is UTF-8 based (`UriCodec.decode(s, convertPlus = false, UTF_8)`), so a
    // multi-byte character has to be escaped byte by byte, not code-point by code-point.
    assert.equal(escapeIntentValue('é'), '%C3%A9')
    assert.equal(escapeIntentValue('中'), '%E4%B8%AD')
  })

  it('does not turn a plus into a space', () => {
    // `Uri.decode(s)` passes convertPlus = false. An encoder that assumed form encoding and left
    // `+` bare would print a space instead of a plus on every receipt with a phone number.
    assert.equal(escapeIntentValue('+'), '%2B')
    const parsed = parseIntentUri(
      buildIntentUri({ action: 'x', extras: { k: 'a+b' } })
    )
    assert.equal(parsed.extras['k'], 'a+b')
  })
})

describe('buildIntentUri', () => {
  it('produces the documented shape', () => {
    const uri = buildIntentUri({
      action: 'android.intent.action.SEND',
      package: 'com.rawthermal.app',
      type: 'text/plain',
      extras: { 'android.intent.extra.TEXT': 'hello' }
    })

    assert.equal(
      uri,
      'intent:#Intent;action=android.intent.action.SEND;type=text%2Fplain;' +
        'package=com.rawthermal.app;S.android.intent.extra.TEXT=hello;end;'
    )
  })

  it('parses back into the intended intent', () => {
    const parsed = parseIntentUri(
      buildIntentUri({
        action: 'android.intent.action.SEND',
        package: 'com.rawthermal.app',
        type: 'text/plain',
        extras: { 'android.intent.extra.TEXT': 'hello' }
      })
    )

    assert.equal(parsed.action, 'android.intent.action.SEND')
    assert.equal(parsed.package, 'com.rawthermal.app')
    assert.equal(parsed.type, 'text/plain')
    assert.equal(parsed.extras['android.intent.extra.TEXT'], 'hello')
  })

  it('emits the fallback URL as the extra Chrome reads', () => {
    const parsed = parseIntentUri(
      buildIntentUri({
        action: 'android.intent.action.SEND',
        package: 'com.rawthermal.app',
        fallbackUrl: 'https://example.com/install?a=1&b=2'
      })
    )

    assert.equal(parsed.extras['browser_fallback_url'], 'https://example.com/install?a=1&b=2')
  })

  it('refuses data containing the fragment marker', () => {
    // Android takes the fragment to start at the FIRST `#Intent;`, so data containing it would
    // silently retarget the intent.
    assert.throws(
      () => buildIntentUri({ action: 'x', data: 'base64,#Intent;action=evil' }),
      /must not contain/
    )
  })

  it('keeps extras in insertion order so the URI is stable', () => {
    const uri = buildIntentUri({
      action: 'a',
      extras: { second: '2', first: '1' }
    })
    assert.ok(uri.indexOf('S.second=2') < uri.indexOf('S.first=1'))
  })
})

describe('the failures the escaping prevents', () => {
  /** What the original library did: concatenate the payload straight into the fragment. */
  function naive(value: string): string {
    return `intent:#Intent;action=android.intent.action.SEND;S.k=${value};end;`
  }

  it('lets an unescaped semicolon inject an extra', () => {
    // The value ends at the first `;`, so whatever follows is read as a fresh fragment item.
    // Here that silently adds an extra nobody asked for.
    const parsed = parseIntentUri(naive('first;S.injected=yes'))
    assert.equal(parsed.extras['k'], 'first')
    assert.equal(parsed.extras['injected'], 'yes')

    const escaped = parseIntentUri(
      buildIntentUri({
        action: 'android.intent.action.SEND',
        extras: { k: 'first;S.injected=yes' }
      })
    )
    assert.equal(escaped.extras['k'], 'first;S.injected=yes')
    assert.equal(escaped.extras['injected'], undefined)
  })

  it('makes the whole intent unparseable when the stray segment is not a valid item', () => {
    // AOSP raises "unknown EXTRA type" here. Chrome treats that as an invalid intent and refuses
    // to launch it, so the user sees nothing happen at all — no error, no print.
    assert.throws(() => parseIntentUri(naive('first;second')), /unknown EXTRA type/)
  })

  it('mangles an unescaped percent sign', () => {
    // `%41` decodes to `A`, so "10%41off" arrives as "10Aoff".
    assert.equal(parseIntentUri(naive('10%41off')).extras['k'], '10Aoff')
  })

  it('keeps the fragment marker unique so a value cannot move it', () => {
    // Android starts the fragment at the FIRST `#Intent;`. Ours always comes before the payload,
    // so escaping the value's copy is what keeps the URI unambiguous rather than load-bearing —
    // but "unambiguous" is exactly what a hand-concatenated URI stops being.
    const uri = buildIntentUri({
      action: 'android.intent.action.SEND',
      extras: { k: 'evil#Intent;action=hijacked' }
    })

    assert.equal(uri.split('#Intent;').length - 1, 1)

    const parsed = parseIntentUri(uri)
    assert.equal(parsed.action, 'android.intent.action.SEND')
    assert.equal(parsed.extras['k'], 'evil#Intent;action=hijacked')
  })
})
