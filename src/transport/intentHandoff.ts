/**
 * Shared helper for transports that hand off an `intent:` URI.
 *
 * Three transports (RawBT, Raw Thermal raw, Raw Thermal share) repeat the same shape:
 * render the document, build a URI, open it, catch a failure, return an outcome. Extracting
 * that removes three copies of the error-handling logic and makes it obvious that the only
 * thing that differs between them is the render step and the success message.
 */

import { openIntentUri } from './platform.ts'
import type { TransportOutcome } from './types.ts'

export interface IntentHandoff {
  /** The URI to hand to Android. */
  uri: string
  /** Parts of the document this path could not deliver. */
  warnings: string[]
  /** Shown when the URI was successfully opened. */
  successMessage: string
  /**
   * Shown when `openIntentUri` itself throws (missing browser, blocked navigation).
   * The original `Error.message` is used if one is available, so this is the fallback only.
   */
  failureMessage: string
}

/**
 * Open an `intent:` URI and package the result as a `TransportOutcome`.
 *
 * The `uri` is included in the outcome for debugging and for tests that assert on the exact
 * payload without needing a device.
 */
export function handOffIntentUri(handoff: IntentHandoff): TransportOutcome {
  try {
    openIntentUri(handoff.uri)
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : handoff.failureMessage,
      warnings: handoff.warnings,
      uri: handoff.uri
    }
  }

  return {
    ok: true,
    message: handoff.successMessage,
    warnings: handoff.warnings,
    uri: handoff.uri
  }
}
