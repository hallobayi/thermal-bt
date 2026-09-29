/**
 * The transports, in the order a UI should offer them.
 *
 * Ordered by how much of the document survives, not alphabetically: the raw paths first, then
 * the raster path, then the text path. A caller that shows a picker can just walk this list and
 * filter on `isSupported()`.
 */

import { RawBtTransport } from './rawbt.ts'
import { RawThermalRawTransport, RawThermalShareTransport } from './rawThermal.ts'
import { SystemPrintTransport } from './systemPrint.ts'
import type { Transport, TransportId } from './types.ts'

/** Recommended order: most faithful first. */
export function createTransports(): Transport[] {
  return [
    new RawBtTransport(),
    new RawThermalRawTransport(),
    new RawThermalShareTransport(),
    new SystemPrintTransport()
  ]
}

export function getTransport(id: TransportId): Transport {
  const transport = createTransports().find((candidate) => candidate.id === id)
  if (!transport) throw new Error(`Unknown transport "${id}"`)
  return transport
}

/**
 * The transports that will work in this browser right now.
 *
 * Note what this cannot tell you: whether the target Android app is installed, or — for
 * `rawthermal-raw` — whether the build has the receiver. Both are invisible to a web page.
 */
export function supportedTransports(): Transport[] {
  return createTransports().filter((transport) => transport.isSupported())
}

/**
 * Pick a default transport.
 *
 * Prefers the Raw Thermal paths over RawBT, because a caller using this library is far more
 * likely to have Raw Thermal installed. Falls back through the list rather than throwing, so a
 * desktop browser still gets something to work with.
 */
export function defaultTransport(): Transport {
  const transports = createTransports()
  const preferred: TransportId[] = [
    'rawthermal-raw',
    'rawthermal-share',
    'rawbt',
    'system-print'
  ]

  for (const id of preferred) {
    const transport = transports.find((candidate) => candidate.id === id)
    if (transport?.isSupported()) return transport
  }

  const first = transports[0]
  if (!first) throw new Error('No transports are registered')
  return first
}

export { RawBtTransport, RAWBT_PACKAGE, RAWBT_CAPABILITIES, buildRawBtUri } from './rawbt.ts'
export {
  RawThermalRawTransport,
  RawThermalShareTransport,
  RAW_THERMAL_PACKAGE,
  RAW_THERMAL_PRINT_RAW_ACTION,
  RAW_THERMAL_DATA_EXTRA,
  DEFAULT_SHARE_TITLE,
  RAW_THERMAL_SHARE_CAPABILITIES,
  RAW_THERMAL_RAW_CAPABILITIES,
  buildRawThermalRawUri,
  buildRawThermalShareUri
} from './rawThermal.ts'
export { SystemPrintTransport, SYSTEM_PRINT_CAPABILITIES } from './systemPrint.ts'
export type {
  PrintRequest,
  Transport,
  TransportCapabilities,
  TransportId,
  TransportOutcome
} from './types.ts'
export { buildIntentUri, escapeIntentValue, parseIntentUri } from './intentUri.ts'
export { base64ToBytes, bytesToBase64, percentEscapeBytes } from './encoding.ts'
export { detectEnvironment, openIntentUri, canUseIntentUris } from './platform.ts'
export { handOffIntentUri } from './intentHandoff.ts'
export type { IntentHandoff } from './intentHandoff.ts'
