/**
 * Code page resolution and text encoding.
 *
 * The behaviour worth protecting here is the failure mode: an unknown code page must be loud,
 * and a character the code page cannot represent must be reported. The original library did
 * neither — `setEncoding('UTF-8')` silently selected CP437, and unmappable characters became
 * `?` with nothing to tell the caller.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CODEPAGE_DEFINITIONS,
  UnsupportedCodepageError,
  decodeByte,
  encodeText,
  escPosCodepageNumber,
  resolveCodepage,
  tryResolveCodepage
} from '../../src/escpos/codepages.ts'

/** Inclusive integer range, so the byte sweeps below read as ranges rather than loops. */
function range(from: number, to: number): number[] {
  const values: number[] = []
  for (let value = from; value <= to; value++) values.push(value)
  return values
}

describe('resolveCodepage', () => {
  it('accepts canonical ids', () => {
    assert.equal(resolveCodepage('cp437'), 'cp437')
    assert.equal(resolveCodepage('windows-1251'), 'windows-1251')
    assert.equal(resolveCodepage('utf-8'), 'utf-8')
  })

  it('accepts the spellings the original library used', () => {
    // Values like these are stored in existing apps' settings, so they have to keep working.
    assert.equal(resolveCodepage('WINDOWS1251'), 'windows-1251')
    assert.equal(resolveCodepage('ISO_8859-7'), 'iso-8859-7')
    assert.equal(resolveCodepage('ISO88596'), 'iso-8859-6')
    assert.equal(resolveCodepage('UTF8'), 'utf-8')
    assert.equal(resolveCodepage('CP858'), 'cp858')
  })

  it('treats the Goojprt table typo as CP850', () => {
    assert.equal(resolveCodepage('CP85'), 'cp850')
  })

  it('returns null rather than guessing', () => {
    assert.equal(tryResolveCodepage('nonsense'), null)
    assert.equal(tryResolveCodepage(''), null)
    assert.equal(tryResolveCodepage(null), null)
    assert.equal(tryResolveCodepage(undefined), null)
  })

  it('explains why a multi-byte code page is refused', () => {
    // The original accepted GBK and silently selected CP437, so text printed as mojibake.
    for (const name of ['GBK', 'GB2312', 'Shift_JIS', 'Big5']) {
      assert.equal(tryResolveCodepage(name), null)
      assert.throws(() => resolveCodepage(name), UnsupportedCodepageError)
    }

    assert.throws(() => resolveCodepage('GBK'), /multi-byte code page/)
    assert.throws(() => resolveCodepage('GBK'), /Use "utf-8"/)
  })

  it('throws for an unknown name without claiming it is multi-byte', () => {
    assert.throws(() => resolveCodepage('nonsense'), /Unknown code page/)
  })
})

describe('escPosCodepageNumber', () => {
  it('returns the RawBT numbering by default', () => {
    assert.equal(escPosCodepageNumber('cp437'), 0)
    assert.equal(escPosCodepageNumber('cp866'), 17)
    assert.equal(escPosCodepageNumber('cp850'), 2)
    assert.equal(escPosCodepageNumber('cp874'), 255)
  })

  it('returns the PT-210 numbering on request', () => {
    // CP866 is 7 on a Goojprt clone and 17 on an Epson-compatible printer. Guessing wrong prints
    // plausible-looking mojibake, which is why the variant is explicit.
    assert.equal(escPosCodepageNumber('cp866', 'pt210'), 7)
    assert.equal(escPosCodepageNumber('windows-1251', 'pt210'), 6)
    assert.equal(escPosCodepageNumber('cp874', 'pt210'), 47)
  })

  it('has no code page command for UTF-8', () => {
    // There is no standard `ESC t n` for UTF-8; emitting one would switch a printer that is
    // already in UTF-8 mode back out of it.
    assert.equal(escPosCodepageNumber('utf-8'), null)
    assert.equal(escPosCodepageNumber('utf-8', 'pt210'), null)
  })
})

describe('encodeText', () => {
  it('passes ASCII through unchanged', () => {
    const { bytes, unmapped } = encodeText('Hello, World!', 'cp437')
    assert.deepEqual([...bytes], [...'Hello, World!'].map((character) => character.charCodeAt(0)))
    assert.deepEqual(unmapped, [])
  })

  it('encodes through the code page table', () => {
    // CP437: 0x82 is e-acute, 0x81 is u-umlaut.
    assert.deepEqual([...encodeText('é', 'cp437').bytes], [0x82])
    assert.deepEqual([...encodeText('ü', 'cp437').bytes], [0x81])
  })

  it('agrees with the documented CP437 high half', () => {
    // 0x80..0x82 are Ç, ü, é. A hand-typed table with one wrong entry is exactly the failure this
    // guards against.
    assert.deepEqual([...encodeText('Çüé', 'cp437').bytes], [0x80, 0x81, 0x82])
  })

  it('reports characters the code page cannot represent', () => {
    const { bytes, unmapped } = encodeText('A中B', 'cp437')
    // '?' stands in, and the caller is told so it can warn instead of printing a mystery glyph.
    assert.deepEqual([...bytes], [0x41, 0x3f, 0x42])
    assert.deepEqual(unmapped, ['中'])
  })

  it('counts a non-BMP character as one unmapped character, not two', () => {
    const { unmapped } = encodeText('🧾', 'cp437')
    assert.deepEqual(unmapped, ['🧾'])
  })

  it('reports each unmapped character once', () => {
    const { unmapped } = encodeText('中中中', 'cp437')
    assert.deepEqual(unmapped, ['中'])
  })

  it('encodes UTF-8 as UTF-8', () => {
    const { bytes, unmapped } = encodeText('é', 'utf-8')
    assert.deepEqual([...bytes], [0xc3, 0xa9])
    assert.deepEqual(unmapped, [])
  })

  it('handles an empty string', () => {
    assert.deepEqual([...encodeText('', 'cp437').bytes], [])
    assert.deepEqual(encodeText('', 'cp437').unmapped, [])
  })

  it('encodes the Indonesian characters a POS actually uses', () => {
    const { bytes, unmapped } = encodeText('Rp 25.000 - Nasi Goreng Spesial', 'cp437')
    assert.deepEqual(unmapped, [])
    assert.equal(bytes.length, 'Rp 25.000 - Nasi Goreng Spesial'.length)
  })

  it('flags the em dash, which CP437 does not have', () => {
    // Worth knowing before a receipt is printed with "—" as a separator: CP437 and CP850 have no
    // em dash, so it becomes a "?" and the caller gets told. The Windows code pages do have one.
    assert.deepEqual(encodeText('—', 'cp437').unmapped, ['—'])
    assert.deepEqual([...encodeText('—', 'windows-1252').bytes], [0x97])
  })
})

describe('decodeByte', () => {
  it('round-trips every representable byte of every code page', () => {
    // A generated table is only trustworthy if both directions agree.
    // 0x7f is excluded: it is DEL, not a printable character, so it is deliberately not in the
    // reverse table and would encode back as "?".
    const printable = [
      ...range(0x20, 0x7e),
      ...range(0x80, 0xff)
    ]

    for (const definition of CODEPAGE_DEFINITIONS) {
      if (definition.id === 'utf-8') continue

      for (const byte of printable) {
        const character = decodeByte(byte, definition.id)
        if (character === '\ufffd') continue

        const { bytes } = encodeText(character, definition.id)
        assert.equal(
          bytes[0],
          byte,
          `${definition.id}: 0x${byte.toString(16)} decoded to ${character} but encoded back to 0x${(bytes[0] ?? 0).toString(16)}`
        )
      }
    }
  })

  it('maps the CP437 box-drawing range', () => {
    // 0xDB is the full block, which is what a receipt uses for a solid separator.
    assert.equal(decodeByte(0xdb, 'cp437'), '█')
  })
})
