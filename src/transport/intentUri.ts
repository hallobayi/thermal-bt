/**
 * Building `intent:` URIs that Android's own parser will read back correctly.
 *
 * This is the part of the original library that was pure guesswork: it hard-coded
 * `"intent:" + textEncoded + S + P` and never explained why, so any payload containing `;` or
 * `%` silently produced a different intent than intended. The escaping rules below are taken
 * from AOSP `Intent.parseUriInner`, which is the code that will actually read them:
 *
 * - The fragment is introduced by the **first** `#Intent;` in the string, so the data part
 *   before it cannot contain that literal.
 * - Items are `key=value;` separated by semicolons, terminated by `end`. A value therefore ends
 *   at the first `;` — an unescaped semicolon truncates the value.
 * - Every value is passed through `Uri.decode`, which is UTF-8 based and does **not** turn `+`
 *   into a space (`Uri.decode` -> `UriCodec.decode(s, convertPlus = false, UTF_8)`).
 *
 * Because values are decoded, the only safe encoding is to percent-escape everything outside a
 * conservative unreserved set. `escapeIntentValue` does exactly that, and `parseIntentUri` below
 * re-implements the AOSP loop so the round trip can be proven in a test instead of on a phone.
 */

/** Conservative unreserved set: escaping anything else is always safe, escaping less is not. */
const UNRESERVED = /^[A-Za-z0-9\-_.~]$/

/**
 * Percent-escape a value so Android's `Uri.decode` returns it unchanged.
 *
 * Non-ASCII characters are escaped as their UTF-8 bytes, because `Uri.decode` decodes to UTF-8.
 */
export function escapeIntentValue(value: string): string {
  let out = ''

  for (const byte of new TextEncoder().encode(value)) {
    const character = String.fromCharCode(byte)
    out += UNRESERVED.test(character)
      ? character
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }

  return out
}

export interface IntentSpec {
  /** Fully qualified action, e.g. `android.intent.action.SEND`. */
  action: string
  /** Target package. Required: Chrome refuses to launch a package-less intent from a page. */
  package?: string
  /** `package/class` pair, when a specific component is wanted instead of resolution. */
  component?: string
  /** MIME type. */
  type?: string
  categories?: readonly string[]
  /** Data URI, placed before `#Intent;`. Must not contain the literal `#Intent;`. */
  data?: string
  /** Explicit launch flags. */
  launchFlags?: number
  /** String extras. Keys may use dots; both key and value are escaped. */
  extras?: Readonly<Record<string, string>>
  /**
   * Where Chrome should go when the app is not installed.
   *
   * Chrome reads this as the `browser_fallback_url` extra, so it is emitted as one — there is
   * no separate slot for it in the URI grammar.
   */
  fallbackUrl?: string
}

/**
 * Build an `intent:` URI.
 *
 * Deliberately does not validate that the action or package exist: this runs in a browser, which
 * has no way to know, and a URI that is well-formed but points at a missing app is a normal
 * situation to handle with `fallbackUrl`.
 */
export function buildIntentUri(spec: IntentSpec): string {
  const items: string[] = []

  items.push(`action=${escapeIntentValue(spec.action)}`)
  if (spec.type !== undefined) items.push(`type=${escapeIntentValue(spec.type)}`)
  if (spec.package !== undefined) items.push(`package=${escapeIntentValue(spec.package)}`)
  if (spec.component !== undefined) items.push(`component=${escapeIntentValue(spec.component)}`)
  for (const category of spec.categories ?? []) {
    items.push(`category=${escapeIntentValue(category)}`)
  }
  if (spec.launchFlags !== undefined) items.push(`launchFlags=0x${spec.launchFlags.toString(16)}`)

  const extras: Record<string, string> = { ...spec.extras }
  if (spec.fallbackUrl !== undefined) extras['browser_fallback_url'] = spec.fallbackUrl

  for (const [key, value] of Object.entries(extras)) {
    // `S.` is the string extra type; the key is decoded by the parser too, so escape it as well.
    items.push(`S.${escapeIntentValue(key)}=${escapeIntentValue(value)}`)
  }

  const data = spec.data ?? ''
  if (data.includes('#Intent;')) {
    throw new Error('Intent data must not contain the literal "#Intent;"')
  }

  return `intent:${data}#Intent;${items.join(';')};end;`
}

export interface ParsedIntent {
  action: string | null
  package: string | null
  type: string | null
  categories: string[]
  scheme: string | null
  data: string
  extras: Record<string, string>
}

/**
 * A faithful re-implementation of the AOSP `#Intent;` fragment loop, for tests only.
 *
 * Not used at runtime — it exists so that escaping can be verified against the rules the real
 * parser follows, without needing an Android device in the loop.
 */
export function parseIntentUri(uri: string): ParsedIntent {
  if (!uri.startsWith('intent:')) throw new Error('Not an intent: URI')

  const body = uri.slice('intent:'.length)
  const fragmentStart = body.indexOf('#Intent;')

  const result: ParsedIntent = {
    action: null,
    package: null,
    type: null,
    categories: [],
    scheme: null,
    data: fragmentStart < 0 ? body : body.slice(0, fragmentStart),
    extras: {}
  }

  if (fragmentStart < 0) return result

  let index = fragmentStart + '#Intent;'.length

  // AOSP: `while (i >= 0 && !uri.startsWith("end", i))`
  while (index >= 0 && index < body.length && !body.startsWith('end', index)) {
    const equals = body.indexOf('=', index)
    const semicolon = body.indexOf(';', index)
    if (semicolon < 0) throw new Error('uri end not found')

    const value = equals >= 0 && equals < semicolon ? decodeUriPart(body.slice(equals + 1, semicolon)) : ''
    const item = body.slice(index, equals >= 0 ? equals : index)

    if (item === 'action') result.action = value
    else if (item === 'package') result.package = value
    else if (item === 'type') result.type = value
    else if (item === 'category') result.categories.push(value)
    else if (item === 'scheme') result.scheme = value
    else if (item.startsWith('S.')) {
      // AOSP: `Uri.decode(uri.substring(i + 2, eq))`
      result.extras[decodeUriPart(item.slice(2))] = value
    } else {
      throw new Error(`unknown EXTRA type in "${item}"`)
    }

    index = semicolon + 1
  }

  return result
}

/** `Uri.decode` — UTF-8, and `+` stays a `+`. Malformed escapes are left alone. */
function decodeUriPart(value: string): string {
  const bytes: number[] = []

  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (character === '%' && index + 3 <= value.length) {
      const hex = value.slice(index + 1, index + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16))
        index += 2
        continue
      }
    }
    if (character === undefined) continue
    for (const byte of new TextEncoder().encode(character)) bytes.push(byte)
  }

  return new TextDecoder().decode(Uint8Array.from(bytes))
}
