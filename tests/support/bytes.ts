/**
 * Small helpers for asserting on byte output.
 *
 * Kept out of the `*.test.ts` glob so the runner does not treat it as a test file.
 */

import assert from 'node:assert/strict'

/** `Uint8Array` -> `1b 40` style hex, which is how ESC/POS is documented everywhere. */
export function hex(bytes: Uint8Array | readonly number[]): string {
  return [...bytes].map((value) => (value & 0xff).toString(16).padStart(2, '0')).join(' ')
}

/** Assert byte equality and report the mismatch in hex rather than as two number arrays. */
export function assertBytes(actual: Uint8Array | readonly number[], expected: readonly number[]): void {
  assert.equal(
    hex(actual),
    hex(expected),
    `bytes differ\n  actual:   ${hex(actual)}\n  expected: ${hex(expected)}`
  )
}
