/**
 * Code page selection and text encoding.
 *
 * The original library had a subtle bug here: `setEncoding('UTF-8')` looked up `defaultCodePages`
 * for a key that does not exist, got `undefined`, and `undefined < 0` is false — so it emitted
 * `FS . ESC t 0` and silently selected CP437 while the caller believed they were printing UTF-8.
 * Text came out as mojibake with no error anywhere.
 *
 * Here, every code page is an explicit definition, an unknown name is a loud failure, and the
 * characters a code page cannot represent are reported back to the caller instead of being
 * replaced by a question mark in silence.
 */

import { CODEPAGE_TABLES, UNMAPPED_CODE_POINT, type GeneratedCodepageId } from './codepageTables.ts'

/** A code page we can encode text to. `utf-8` is handled separately — it is not single-byte. */
export type CodepageId = GeneratedCodepageId | 'utf-8'

/**
 * Printers disagree about the number that selects a code page.
 *
 * `rawbt` is the numbering RawBT and most Epson-compatible printers use. `pt210` is the
 * numbering used by the PT-210 / Goojprt clones, where for example CP866 is 7 rather than 17.
 * Guessing wrong prints plausible-looking mojibake, so the variant is explicit.
 */
export type CodepageNumbering = 'rawbt' | 'pt210'

export interface CodepageDefinition {
  id: CodepageId
  /** Human-readable name, for a settings dropdown. */
  label: string
  /**
   * `ESC t n` value per numbering, or `null` when no code-page command should be emitted.
   *
   * UTF-8 is `null`: there is no standard `ESC t n` for it, and printers that accept UTF-8
   * natively are already in that mode. Emitting a number would switch them out of it.
   */
  escPos: Record<CodepageNumbering, number> | null
}

const LABELS: Record<CodepageId, string> = {
  cp437: 'CP437 (US, OEM)',
  cp737: 'CP737 (Greek)',
  cp775: 'CP775 (Baltic)',
  cp850: 'CP850 (Western European)',
  cp852: 'CP852 (Central European)',
  cp855: 'CP855 (Cyrillic)',
  cp857: 'CP857 (Turkish)',
  cp858: 'CP858 (Western European, euro)',
  cp860: 'CP860 (Portuguese)',
  cp861: 'CP861 (Icelandic)',
  cp862: 'CP862 (Hebrew)',
  cp863: 'CP863 (Canadian French)',
  cp864: 'CP864 (Arabic)',
  cp865: 'CP865 (Nordic)',
  cp866: 'CP866 (Cyrillic)',
  cp869: 'CP869 (Greek)',
  cp874: 'CP874 (Thai)',
  'windows-1250': 'Windows-1250 (Central European)',
  'windows-1251': 'Windows-1251 (Cyrillic)',
  'windows-1252': 'Windows-1252 (Western European)',
  'windows-1253': 'Windows-1253 (Greek)',
  'windows-1254': 'Windows-1254 (Turkish)',
  'windows-1255': 'Windows-1255 (Hebrew)',
  'windows-1256': 'Windows-1256 (Arabic)',
  'windows-1257': 'Windows-1257 (Baltic)',
  'windows-1258': 'Windows-1258 (Vietnamese)',
  'iso-8859-6': 'ISO-8859-6 (Arabic)',
  'iso-8859-7': 'ISO-8859-7 (Greek)',
  'utf-8': 'UTF-8 (printer native mode)'
}

/** `ESC t n` per numbering. Only the entries that differ between the two tables are listed twice. */
const ESC_POS_NUMBERS: Record<string, Record<CodepageNumbering, number>> = {
  cp437: { rawbt: 0, pt210: 0 },
  cp850: { rawbt: 2, pt210: 2 },
  cp860: { rawbt: 3, pt210: 3 },
  cp863: { rawbt: 4, pt210: 4 },
  cp865: { rawbt: 5, pt210: 5 },
  'windows-1251': { rawbt: 73, pt210: 6 },
  cp866: { rawbt: 17, pt210: 7 },
  cp775: { rawbt: 95, pt210: 9 },
  cp857: { rawbt: 13, pt210: 13 },
  cp737: { rawbt: 14, pt210: 24 },
  cp862: { rawbt: 62, pt210: 15 },
  'iso-8859-7': { rawbt: 15, pt210: 15 },
  'windows-1252': { rawbt: 16, pt210: 16 },
  'windows-1253': { rawbt: 90, pt210: 17 },
  cp852: { rawbt: 18, pt210: 18 },
  cp858: { rawbt: 19, pt210: 19 },
  cp864: { rawbt: 28, pt210: 22 },
  'iso-8859-6': { rawbt: 22, pt210: 22 },
  'windows-1257': { rawbt: 25, pt210: 25 },
  'windows-1256': { rawbt: 92, pt210: 34 },
  cp874: { rawbt: 255, pt210: 47 },
  'windows-1255': { rawbt: 32, pt210: 32 },
  cp861: { rawbt: 56, pt210: 56 },
  cp855: { rawbt: 60, pt210: 60 },
  cp869: { rawbt: 66, pt210: 66 },
  'windows-1250': { rawbt: 72, pt210: 72 },
  'windows-1254': { rawbt: 91, pt210: 91 },
  'windows-1258': { rawbt: 94, pt210: 94 }
}

/**
 * Spellings the original library accepted, mapped onto the canonical id.
 *
 * These are kept so a value stored by an older app keeps working after upgrading.
 */
const ALIASES: Record<string, CodepageId> = {
  // The original used WINDOWS1251 / ISO_8859-7 / ISO88596 style keys.
  windows1250: 'windows-1250',
  windows1251: 'windows-1251',
  windows1252: 'windows-1252',
  windows1253: 'windows-1253',
  windows1254: 'windows-1254',
  windows1255: 'windows-1255',
  windows1256: 'windows-1256',
  windows1257: 'windows-1257',
  windows1258: 'windows-1258',
  iso88596: 'iso-8859-6',
  iso88597: 'iso-8859-7',
  'iso-8859-6': 'iso-8859-6',
  'iso-8859-7': 'iso-8859-7',
  iso_8859_6: 'iso-8859-6',
  iso_8859_7: 'iso-8859-7',
  // `cp85` is a typo present in the Goojprt table; treat it as CP850 rather than failing.
  cp85: 'cp850',
  utf8: 'utf-8'
}

/** Code pages the original library offered that need multi-byte tables we do not ship. */
const MULTI_BYTE_NAMES = new Set([
  'gbk',
  'gb2312',
  'gb18030',
  'cp932',
  'shiftjis',
  'sjis',
  'big5',
  'eucjp',
  'euckr',
  'korean',
  'cp949',
  'cp950'
])

export const DEFAULT_CODEPAGE: CodepageId = 'cp437'

/** Every code page this library can encode to, in a stable order for a settings dropdown. */
export const CODEPAGE_DEFINITIONS: readonly CodepageDefinition[] = [
  ...(Object.keys(CODEPAGE_TABLES) as GeneratedCodepageId[]).map((id) => ({
    id: id as CodepageId,
    label: LABELS[id],
    escPos: ESC_POS_NUMBERS[id] ?? null
  })),
  { id: 'utf-8' as CodepageId, label: LABELS['utf-8'], escPos: null }
]

const DEFINITIONS_BY_ID = new Map<CodepageId, CodepageDefinition>(
  CODEPAGE_DEFINITIONS.map((definition) => [definition.id, definition])
)

export class UnsupportedCodepageError extends Error {
  /** The name that could not be resolved. */
  readonly input: string

  constructor(input: string) {
    super(
      MULTI_BYTE_NAMES.has(normalizeKey(input))
        ? `Code page "${input}" is a multi-byte code page and is not supported. ` +
            `Use "utf-8" if the printer has a native UTF-8 mode, or pick a single-byte code page.`
        : `Unknown code page "${input}".`
    )
    this.name = 'UnsupportedCodepageError'
    this.input = input
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * Canonicalise a code page name, or `null` when we cannot handle it.
 *
 * Accepts the original library's spellings (`WINDOWS1251`, `ISO_8859-7`, `CP858`) as well as
 * canonical ones (`windows-1251`).
 */
export function tryResolveCodepage(value: string | null | undefined): CodepageId | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  const lower = trimmed.toLowerCase()
  if (DEFINITIONS_BY_ID.has(lower as CodepageId)) return lower as CodepageId

  const key = normalizeKey(trimmed)
  const aliased = ALIASES[key]
  if (aliased !== undefined) return aliased

  const dashed = key.replace(/^iso8859(\d+)$/, 'iso-8859-$1').replace(/^windows(\d+)$/, 'windows-$1')
  if (DEFINITIONS_BY_ID.has(dashed as CodepageId)) return dashed as CodepageId

  return null
}

/** Like `tryResolveCodepage`, but throws a message that says what to do about it. */
export function resolveCodepage(value: string | null | undefined): CodepageId {
  const resolved = tryResolveCodepage(value)
  if (resolved === null) {
    throw new UnsupportedCodepageError(String(value ?? ''))
  }
  return resolved
}

export function getCodepageDefinition(id: CodepageId): CodepageDefinition {
  const definition = DEFINITIONS_BY_ID.get(id)
  if (!definition) throw new UnsupportedCodepageError(id)
  return definition
}

/**
 * The `ESC t n` value for a code page, or `null` when no code-page command should be sent.
 */
export function escPosCodepageNumber(
  id: CodepageId,
  numbering: CodepageNumbering = 'rawbt'
): number | null {
  return getCodepageDefinition(id).escPos?.[numbering] ?? null
}

/** Reverse lookup, memoised: code point -> byte. */
const reverseTables = new Map<CodepageId, Map<number, number>>()

function reverseTableFor(id: CodepageId): Map<number, number> {
  const cached = reverseTables.get(id)
  if (cached) return cached

  const table = new Map<number, number>()

  // ASCII first so it always wins: every code page in this library agrees on 0x20-0x7E, and a
  // code page whose high half repeats an ASCII code point must not steal it.
  for (let byte = 0x20; byte <= 0x7e; byte++) table.set(byte, byte)

  const high = id === 'utf-8' ? undefined : CODEPAGE_TABLES[id as GeneratedCodepageId]
  if (high) {
    for (let index = 0; index < high.length; index++) {
      const codePoint = high.charCodeAt(index)
      if (codePoint === UNMAPPED_CODE_POINT) continue
      const byte = 0x80 + index
      if (!table.has(codePoint)) table.set(codePoint, byte)
    }
  }

  reverseTables.set(id, table)
  return table
}

export interface EncodedText {
  bytes: Uint8Array
  /**
   * Characters the code page cannot represent, deduplicated and in first-seen order.
   *
   * Surfacing these is the whole point: a receipt that silently prints `?` for `é` is a support
   * ticket, not a feature.
   */
  unmapped: string[]
}

/**
 * Encode text to the bytes a printer in the given code page expects.
 *
 * UTF-8 is passed straight through `TextEncoder`; every other code page goes through its
 * generated table.
 */
export function encodeText(text: string, codepage: CodepageId = DEFAULT_CODEPAGE): EncodedText {
  if (codepage === 'utf-8') {
    return { bytes: new TextEncoder().encode(text), unmapped: [] }
  }

  const table = reverseTableFor(codepage)
  const bytes = new Uint8Array(text.length)
  const unmapped: string[] = []
  const seen = new Set<string>()

  let length = 0
  // Iterating by code point, not by UTF-16 unit: an emoji is one character to the user and two
  // `charAt` units, and reporting it as two unmapped characters would be confusing.
  for (const character of text) {
    const codePoint = character.codePointAt(0)
    const byte = codePoint === undefined ? undefined : table.get(codePoint)

    if (byte === undefined) {
      // 0x3f is '?', the conventional stand-in for an unrepresentable character.
      bytes[length++] = 0x3f
      if (!seen.has(character)) {
        seen.add(character)
        unmapped.push(character)
      }
      continue
    }

    bytes[length++] = byte
  }

  return { bytes: bytes.subarray(0, length), unmapped }
}

/** Decode a single byte back to its character. Used by tests and by the demo's byte inspector. */
export function decodeByte(byte: number, codepage: CodepageId = DEFAULT_CODEPAGE): string {
  if (codepage === 'utf-8') {
    return new TextDecoder().decode(new Uint8Array([byte & 0xff]))
  }

  const value = byte & 0xff
  if (value >= 0x80) {
    const high = CODEPAGE_TABLES[codepage]
    const codePoint = high.charCodeAt(value - 0x80)
    return String.fromCodePoint(codePoint === UNMAPPED_CODE_POINT ? 0xfffd : codePoint)
  }
  return String.fromCharCode(value)
}
