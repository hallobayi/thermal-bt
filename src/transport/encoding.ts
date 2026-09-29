/**
 * On-the-wire encodings for handing bytes to an Android app.
 *
 * Two conventions are in play and they are easy to confuse:
 *
 * - RawBT's `rawbt:` scheme carries **percent-escaped ASCII** — `ESC @` becomes the five
 *   characters `%1b%40`, and that string is then base64 encoded. RawBT decodes it back.
 * - A plain "here are the bytes" contract carries **base64 of the raw bytes**, with no
 *   percent-escaping at all.
 *
 * Mixing them up produces a receipt that prints the literal text `%1b%40`, so each lives in its
 * own named function rather than behind a boolean flag.
 */

/**
 * Percent-escape every byte, lowercase hex, exactly as the original library's `chr()` did.
 *
 * Lowercase and zero-padded on purpose: the original emitted `%1b`, and RawBT's decoder is
 * known to accept that form. Changing the case would be a gratuitous risk for zero benefit.
 */
export function percentEscapeBytes(bytes: Uint8Array | readonly number[]): string {
  let out = ''
  for (const value of bytes) {
    out += `%${(value & 0xff).toString(16).padStart(2, '0')}`
  }
  return out
}

/**
 * Base64 encode bytes.
 *
 * Chunked rather than `btoa(String.fromCharCode(...bytes))`: spreading a large array into a
 * function call throws `RangeError` once the argument count gets into the low hundreds of
 * thousands, which is exactly the size a receipt with a logo reaches.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length))
    binary += String.fromCharCode(...slice)
  }

  return btoa(binary)
}

/** Decode base64 back to bytes. Present so the round trip can be asserted in a test. */
export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
