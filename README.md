# thermal-bt

ESC/POS printing from a web page to a thermal printer on Android, through a printer app instead
of a Bluetooth stack.

It is a rewrite of [`rawbt-js-library`](https://github.com/hobysampingan/rawbt-js-library) —
same idea, same wire formats — restructured so that it can target
[Raw Thermal](https://github.com/syofyanzuhad/raw-thermal) as well as RawBT, and so that a job can
be inspected, previewed and tested instead of only being fired at a printer.

```
npm install thermal-bt
```

```js
import { PrintDocument, print } from 'thermal-bt'

const job = new PrintDocument({ columns: 32 })
job.initialize()
   .header('KOPI SENJA', 'Jl. Merdeka 12, Jakarta')
   .rule('=')
   .keyValue('Kopi Susu', '25.000')
   .rule('-')
   .bold(true).keyValue('TOTAL', '25.000').bold(false)
   .feed(2).cut()

await print(job)
```

Call it from a click handler. Chrome refuses external-protocol launches that are not
user-initiated, and a failed launch is silent — this is the single most common way these
integrations break.

## Read this before choosing a transport

A web page cannot talk to a printer directly. It can only hand something to an app, and **which
app, and how, decides what actually prints.** The honest matrix, verified against Raw Thermal's
source rather than its README:

| Transport | App | Bold, sizes | Barcode / QR | Cut, drawer | Works today |
|---|---|---|---|---|---|
| `rawbt` | RawBT | ✅ | ✅ | ✅ | ✅ |
| `rawthermal-raw` | Raw Thermal + [patch](android-patch/README.md) | ✅ | ✅ | ✅ | needs the patch |
| `rawthermal-share` | Raw Thermal as shipped | ❌ | ❌ | ❌ | ✅ (text only) |
| `system-print` | Raw Thermal as shipped | ✅ | ❌ | ❌ | ✅ (rasterised) |

The reason for the gap is one code path. A web page can only reach Raw Thermal through an
`ACTION_SEND` of `text/plain`, and the app then runs it through
`printTextDocument()` → `encoder.textBlock(content, columns)`, which re-wraps the text to the
paper width and re-encodes it through the app's own code page. A raw ESC/POS byte stream cannot
survive that: `ESC` is not in the code page table and becomes `?`, and the wrapping inserts line
breaks inside command sequences.

So `rawthermal-share` renders the job down to text — and tells you what it dropped, rather than
printing a silently wrong receipt. `android-patch/` contains the small, complete change that adds
a `PRINT_RAW` action to the app, after which `rawthermal-raw` gives full parity.

`system-print` is the middle ground that needs no app change: `window.print()` opens the Android
print dialog, the user picks Raw Thermal, and the app's `PrintService` rasterises the markup. You
get styling, and you lose the cutter.

## Transports

```js
import { createTransports, print, supportedTransports } from 'thermal-bt'

supportedTransports()        // those that work in this browser
createTransports()           // all of them, best first
print(job, { transport: 'rawthermal-share', title: 'receipt.txt' })
```

`print()` resolves to an outcome instead of throwing, because "the app is not installed" is a
normal thing for a web page to hit:

```ts
{
  ok: true,
  message: 'Sent to Raw Thermal. Open it and tap Print.',
  warnings: ['Bold is not available on this path.'],
  uri: 'intent:#Intent;action=android.intent.action.SEND;...'
}
```

Every transport declares its `capabilities` up front, so a UI can grey out what will not work
instead of discovering it after the fact.

If you want a plain `<a href>` — the most reliable way to survive a strict browser — build the URI
yourself:

```js
import { buildRawThermalShareUri } from 'thermal-bt'
anchor.href = buildRawThermalShareUri(text, 'receipt.txt', 'https://example.com/install')
```

## Documents

A job is data, not bytes. That is what makes one job render three ways.

```js
job.initialize()                  // ESC @
   .codepage('cp437')             // ESC t n
   .align('center').bold(true).fontSize('large')
   .line('KOPI SENJA')
   .resetFormatting()
   .keyValue('Kopi Susu', '25.000')  // label ... value, right-aligned
   .rule('-')                        // full-width rule
   .qrcode('https://example.com', { moduleSize: 4 })
   .barcode('INV20260001', 'code128', { height: 60, hri: 'below' })
   .feed(2)
   .cut('full')
   .openDrawer()
```

Rendering it:

```js
import { renderEscPos, renderPlainText, renderHtml } from 'thermal-bt'

renderEscPos(job)              // { output: Uint8Array, warnings: [] }
renderPlainText(job)           // { output: string, warnings: [...] }
renderHtml(job)                // { output: string, warnings: [...] }
```

Each renderer returns the warnings for anything it could not express, which is how the
`rawthermal-share` path can tell the user their barcode became text.

## Code pages

28 single-byte code pages, with the tables generated from real codecs (`npm run codepages`) rather
than typed by hand.

```js
import { CODEPAGE_DEFINITIONS, encodeText, escPosCodepageNumber } from 'thermal-bt'

escPosCodepageNumber('cp866')            // 17  (RawBT numbering)
escPosCodepageNumber('cp866', 'pt210')   // 7   (Goojprt clones)
encodeText('é', 'cp437')                 // { bytes: Uint8Array [0x82], unmapped: [] }
encodeText('—', 'cp437')                 // { bytes: Uint8Array [0x3f], unmapped: ['—'] }
```

Two things worth knowing:

- **`ESC t n` numbering differs between printers.** CP866 is 17 on an Epson-compatible printer and
  7 on a PT-210 clone. Guessing wrong prints plausible-looking mojibake, so the variant is an
  explicit argument.
- **CP437 and CP850 have no em dash.** A receipt that uses `—` as a separator prints `?`. Use
  `windows-1252` if you need one. `encodeText` reports it rather than staying quiet.

Double-byte code pages (GBK, Shift-JIS, Big5) are deliberately not supported — they need
megabyte-scale tables, and claiming support we cannot honour byte-for-byte would be worse than
not offering the option.

## What changed from the original library

The original was a single 1,061-line file with one exported idea. Its structure was the main
obstacle: `PosPrinterJob` pushed percent-escaped ESC/POS fragments into a string buffer, so the
only thing a job could ever be used for was being sent to RawBT. No preview, no tests, no second
transport.

The rewrite splits it into layers that can each be tested on their own:

```
escpos/     commands.ts     pure byte builders, one function per ESC/POS command
            EscPosEncoder   the streaming writer, and the only place that emits bytes
            codepages.ts    code page registry, text encoding, unmapped reporting
            raster.ts       greyscale -> 1-bit rows
text/       layout.ts       wrapping and padding for a character grid
document/   PrintDocument   the job, as a list of operations
            render*.ts      one renderer per output format
transport/  intentUri.ts    Android intent URI grammar
            *.ts            one file per way of reaching a printer app
```

Bugs fixed along the way, each with a test:

| Bug | Consequence |
|---|---|
| Implicit globals (`S`, `P`, `header`, `r`, `cn`, `bytes`, `s`, `self`, `i`, …) | Any two jobs on one page clobbered each other's state |
| Payload concatenated into the URI unescaped | A `;` in a receipt injected an extra into the intent or made it unlaunchable; `%41` decoded to `A` |
| `unescape` / `btoa` on the whole payload | Deprecated, and throws on non-Latin-1 input |
| `driver.relese()` | Typo; `release()` always threw |
| `new PosPrinterJob()` with no arguments | `driver` and `transport` were `undefined`; every method threw — and this is what the README told you to write |
| `setEncoding('UTF-8')` | Silently selected CP437, so UTF-8 text printed as mojibake with no error |
| `setCharacterTable(negative)` returned `FS &` | A two-byte fragment where a command was expected |
| `barcode()` used `content.length` | Wrong length byte for any non-ASCII content, desynchronising the stream |
| `btoa(String.fromCharCode(...bytes))` | `RangeError` past ~100k arguments — a receipt with a logo |
| `window.location.href = uri` | A failed launch replaced the user's page |

## Plain script tag (no bundler)

If you are not using a module system, load the global bundle:

```html
<script src="https://cdn.jsdelivr.net/npm/thermal-bt@latest/dist/thermal-bt.global.min.js"></script>
<script>
  const job = new thermalBt.PrintDocument({ columns: 32 })
  job.initialize().header('KOPI SENJA', 'Jl. Merdeka 12, Jakarta').rule().cut()
  thermalBt.print(job)
</script>
```

Or download `dist/thermal-bt.global.min.js` and serve it yourself. The same file also works as a
UMD module (`require('thermal-bt')` in Node, or an AMD loader in the browser).

## Development

```
npm test          # node --test, no vitest or jest
npm run typecheck # tsc, sources and tests
npm run build     # tsc -> dist, ESM + .d.ts + global bundles
npm run verify    # all three
npm run examples  # http://127.0.0.1:4173
```

The sources are executed directly by `node --test`, which strips types rather than compiling them.
That is why `erasableSyntaxOnly` is on: no enums, no namespaces, no parameter properties. It is
also why modules import each other with an explicit `.ts` extension — `rewriteRelativeImportExtensions`
turns those into `.js` on emit, so one source tree serves both the test runner and the published
build.

Tests live outside `src/` so the build config can emit `src/` alone. `tests/support/` is not
matched by the `*.test.ts` glob.

The examples import `dist/`, so run `npm run build` before `npm run examples`. To exercise the
`intent:` hand-offs you need a phone: `HOST=0.0.0.0 npm run examples`, then open the printed URL
on the device.

## Limitations

- **`intent:` URIs need Chromium on Android.** `detectEnvironment()` reports whether they are
  usable; on anything else only `system-print` is left.
- **A browser cannot tell whether the target app is installed**, nor whether a Raw Thermal build
  has the `PRINT_RAW` receiver. `isSupported()` answers "is this kind of hand-off available here",
  which is the strongest thing a web page can know. Pass `fallbackUrl` to handle the miss.
- **No USB or network transport.** Both need app-side support that neither RawBT nor Raw Thermal
  exposes to a browser.
- **The Android patch is uncompiled.** This machine has only JDK 8 and 12, while Capacitor 8 needs
  JDK 17+ and `compileSdk 35`. See `android-patch/README.md` for what still needs verifying on a
  device.

## Licence

MIT.
