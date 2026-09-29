/**
 * Generates `src/escpos/codepageTables.ts` from real codec implementations.
 *
 * Why generate instead of typing the tables: a single wrong entry prints the wrong glyph on a
 * customer's receipt, and nobody notices until someone complains. Deriving them from
 * iconv-lite — the same library the original `rawbt-js-library` shipped — means the tables are
 * correct by construction.
 *
 * iconv-lite is a devDependency only. The generated file is plain data with no imports, so the
 * published library keeps zero runtime dependencies.
 *
 * Run with: npm run codepages
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import iconv from 'iconv-lite'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', 'src', 'escpos', 'codepageTables.ts')

/**
 * Single-byte code pages only.
 *
 * Double-byte pages (CP932, GBK, ...) are deliberately excluded: they need multi-byte encoding
 * tables in the megabytes, and the printers that support them do it through a native "Kanji
 * mode" that ESC/POS selects with `FS &`. Claiming support we cannot honour byte-for-byte would
 * be worse than not offering the option.
 */
const CODEPAGES = [
  { id: 'cp437', iconv: 'cp437' },
  { id: 'cp737', iconv: 'cp737' },
  { id: 'cp775', iconv: 'cp775' },
  { id: 'cp850', iconv: 'cp850' },
  { id: 'cp852', iconv: 'cp852' },
  { id: 'cp855', iconv: 'cp855' },
  { id: 'cp857', iconv: 'cp857' },
  { id: 'cp858', iconv: 'cp858' },
  { id: 'cp860', iconv: 'cp860' },
  { id: 'cp861', iconv: 'cp861' },
  { id: 'cp862', iconv: 'cp862' },
  { id: 'cp863', iconv: 'cp863' },
  { id: 'cp864', iconv: 'cp864' },
  { id: 'cp865', iconv: 'cp865' },
  { id: 'cp866', iconv: 'cp866' },
  { id: 'cp869', iconv: 'cp869' },
  { id: 'cp874', iconv: 'cp874' },
  { id: 'windows-1250', iconv: 'windows1250' },
  { id: 'windows-1251', iconv: 'windows1251' },
  { id: 'windows-1252', iconv: 'windows1252' },
  { id: 'windows-1253', iconv: 'windows1253' },
  { id: 'windows-1254', iconv: 'windows1254' },
  { id: 'windows-1255', iconv: 'windows1255' },
  { id: 'windows-1256', iconv: 'windows1256' },
  { id: 'windows-1257', iconv: 'windows1257' },
  { id: 'windows-1258', iconv: 'windows1258' },
  { id: 'iso-8859-7', iconv: 'iso-8859-7' },
  { id: 'iso-8859-6', iconv: 'iso-8859-6' }
]

/** Placeholder for a byte the code page leaves undefined. */
const UNMAPPED = 0xfffd

function tableFor(iconvName) {
  if (!iconv.encodingExists(iconvName)) {
    throw new Error(`iconv-lite does not know the encoding "${iconvName}"`)
  }

  const high = []
  for (let byte = 0x80; byte <= 0xff; byte++) {
    // Decode the single byte on its own. A multi-byte encoding would return '' or a partial
    // sequence here, which is exactly why this script rejects them above.
    const decoded = iconv.decode(Buffer.from([byte]), iconvName)
    if (decoded.length !== 1) {
      throw new Error(
        `"${iconvName}" is not a single-byte encoding: byte 0x${byte.toString(16)} decoded to ${JSON.stringify(decoded)}`
      )
    }
    high.push(decoded.codePointAt(0))
  }

  return high
}

/** A `\uXXXX` escape for every code point, so the file stays pure ASCII and diff-friendly. */
function escapeTable(codePoints) {
  return codePoints
    .map((codePoint) => {
      const value = codePoint === UNMAPPED ? UNMAPPED : codePoint
      return `\\u${value.toString(16).padStart(4, '0')}`
    })
    .join('')
}

const lines = []
lines.push('/*')
lines.push(' * GENERATED FILE — do not edit by hand.')
lines.push(' *')
lines.push(' * Run `npm run codepages` to regenerate. Each string holds the 128 code points for')
lines.push(' * bytes 0x80-0xFF of that code page, in order, escaped as \\uXXXX so the file is ASCII.')
lines.push(' * Bytes 0x00-0x7F are not stored: they are ASCII in every code page listed here.')
lines.push(' */')
lines.push('')
lines.push('/** Code point used when a byte has no glyph in the code page. */')
lines.push(`export const UNMAPPED_CODE_POINT = 0x${UNMAPPED.toString(16)}`)
lines.push('')
lines.push('export const CODEPAGE_TABLES = {')

for (const { id, iconv: iconvName } of CODEPAGES) {
  const table = tableFor(iconvName)
  lines.push(`  ${JSON.stringify(id)}: "${escapeTable(table)}",`)
}

lines.push('} as const')
lines.push('')
lines.push('export type GeneratedCodepageId = keyof typeof CODEPAGE_TABLES')
lines.push('')

writeFileSync(target, lines.join('\n'), 'utf8')
console.log(`Wrote ${CODEPAGES.length} code pages to ${target}`)
