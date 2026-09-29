# Integrating a web page with Raw Thermal

**Date:** 2026-09-29
**Method:** read the source of `syofyanzuhad/raw-thermal` and AOSP, rather than the READMEs.
Line numbers refer to the versions read on that date.

## 1. What RawBT offers, for comparison

RawBT is the reference point, because `rawbt-js-library` exists to drive it. Its integration
surface is documented in `402d/DemoRawBtPrinter` and `402d/RawbtAPI`:

| Route | Detail |
|---|---|
| Share text | `ACTION_SEND` + `EXTRA_TEXT`, type `text/plain` |
| Share file | `ACTION_SEND` + `EXTRA_STREAM` (a `content://` URI) |
| Open file | `ACTION_VIEW` with `setDataAndType` |
| **Raw ESC/POS** | action `ru.a402d.rawbtprinter.action.PRINT_RAWBT`, extra `ru.a402d.rawbtprinter.extra.DATA` = `base64,<bytes>`, guarded by `ru.a402d.rawbtprinter.PERMISSION` |
| **URL scheme** | the `rawbt` scheme, which a web page can launch with an `intent:` URI |
| Print framework | a `PrintService` + `PrintDocumentAdapter` |

Two of those matter for a *web page*: the `rawbt` scheme, and the `PRINT_RAWBT` action. Everything
else needs a `content://` URI, which a page cannot produce.

## 2. What Raw Thermal actually offers

Verified by reading the app's source.

| Route | Where | Usable from a web page |
|---|---|---|
| Share text | `AndroidManifest.xml` filter for `SEND` + `text/plain`; read in `ShareIntentReader.kt:49-56` | **yes** |
| Share image / PDF | `AndroidManifest.xml` filter for `SEND` + `image/*`, `application/pdf` | no — needs a `content://` URI |
| Open file | `ShareIntentReader.kt:35` (`ACTION_VIEW`) | no — same reason |
| Print framework | `ThermalPrintService.kt`, `xml/print_service.xml` | **yes** — `window.print()` |
| Raw ESC/POS | *nothing* | no |
| URL scheme | *nothing*. `strings.xml` has `custom_url_scheme` = `com.rawthermal.app`, but no `<data android:scheme=…>` filter is declared, so no scheme is registered | no |
| Plugin bridge | `ShareIntentPlugin.kt` (`hasSharedPayload`, `getSharedPayload`) | no — Capacitor plugins only exist inside the app's own webview |

So a web page has exactly two doors: an `ACTION_SEND` of `text/plain`, and the system print
dialog. **There is no raw-byte door.** That is the whole finding.

## 3. Why the text door cannot carry ESC/POS

This is the part worth being precise about, because "just encode it better" is the obvious wrong
answer.

A shared text arrives at `MainActivity.handleIncomingIntent` (`MainActivity.kt:35`), is read by
`ShareIntentReader.readSend`, is held in `SharedIntentHolder`, and is pulled by the web layer on
mount (`useIncomingJobs.ts:53`). From there:

```
sharedPayload.ts:105   parseSharedPayload      -> { kind: 'text', text }
incoming.ts:44         buildIncomingJob        -> SelectedFile { type: 'text' }
useFilePrint.ts:212    printSelected           -> printTextDocument(textContent)
usePrint.ts:248        printTextDocument       -> encoder.textBlock(content, columns)
```

`textBlock` is where the byte stream dies. It wraps the content to the paper width and encodes it
through the app's own code page, and `printTextDocument` surrounds it with its own
`initialize()` and `feed()`/`cut()`.

Concretely, for a payload containing `ESC @` (0x1B 0x40):

1. `0x1B` is not in any code page table the app ships — those tables only cover 0x80-0xFF, and the
   ASCII range 0x20-0x7E. So it is replaced with `?` (`0x3F`).
2. The wrapping inserts a line break wherever the stream crosses a column boundary, which lands
   inside a command sequence.
3. The app's own `initialize()` and `cut()` are added around it.

So the payload is not merely re-encoded, it is re-laid-out and re-framed. No escaping trick
avoids this; the app has to be given a second entry point that means "these bytes are the job".

## 4. The `intent:` URI grammar a web page has to get right

`Intent.parseUriInner` is the code that reads these URIs. Three rules decide whether a payload
survives, and the original `rawbt-js-library` violated two of them by concatenating strings:

**Rule 1 — the fragment starts at the first `#Intent;`.**
`Intent.java:8242`: `int i = uri.indexOf("#Intent;")`. Data containing that literal moves the
fragment, so `buildIntentUri` rejects it outright.

**Rule 2 — a value ends at the first `;`.**
`Intent.java:8255`: `int semi = uri.indexOf(';', i)`, then
`Intent.java:8259`: `value = eq < semi ? Uri.decode(uri.substring(eq + 1, semi)) : ""`.
An unescaped `;` therefore ends the value and starts a new fragment item. If that item looks like
a valid one, it becomes an extra nobody asked for; if it does not, AOSP throws
`URISyntaxException("unknown EXTRA type")` and Chrome refuses to launch the intent — silently, from
the user's point of view.

**Rule 3 — values are percent-decoded as UTF-8, and `+` is not a space.**
`Intent.java:8334`: `if (uri.startsWith("S.", i)) b.putString(key, value)`, where `value` came from
`Uri.decode`. And `Uri.java:2023-2029`:

```java
public static String decode(String s) {
    return UriCodec.decode(s, false /* convertPlus */, StandardCharsets.UTF_8, false);
}
```

Two consequences. `%41` in an unescaped value becomes `A`, so "10% off" arrives as "10Aoff". And
because decoding is UTF-8 based, a non-ASCII character has to be escaped as its UTF-8 bytes
(`é` → `%C3%A9`), not as a code point.

`escapeIntentValue` therefore percent-encodes everything outside `[A-Za-z0-9-_.~]`.
`parseIntentUri` in the same module re-implements the AOSP loop, so all of this is asserted in
`tests/transport/intentUri.test.ts` instead of on a phone.

One detail that looks like a rule but is not: the string-extra form `S.key=value` is what the
`#Intent;…;end` fragment uses. There is a second, unrelated grammar using
`extras(key=value!)` inside the fragment (`Intent.java:8499-8536`), which also percent-decodes
values but delimits them with `!` and a closing `)`. RawBT and this library both use the
`S.` form; do not mix the two.

## 5. The capability matrix, and what each path costs

| | `rawbt` | `rawthermal-raw` (patched) | `rawthermal-share` | `system-print` |
|---|---|---|---|---|
| Wire format | percent-escaped bytes, base64 | raw bytes, base64 | plain text | HTML |
| Bold, underline, sizes | ✅ | ✅ | ❌ | ✅ |
| Alignment | ✅ | ✅ | ✅ (leading spaces) | ✅ |
| Barcode, QR | ✅ | ✅ | ❌ (content printed) | ❌ (content printed) |
| Cut | ✅ | ✅ | ❌ | ❌ |
| Cash drawer | ✅ | ✅ | ❌ | ❌ |
| Images | ✅ | ✅ | ❌ | ❌ |
| Text sharpness | ✅ | ✅ | ✅ | rasterised |
| User confirmation | none | none | tap Print | print dialog |
| Bytes for a receipt | ~200 | ~200 | ~200 | tens of KB |

The `system-print` column is the surprise: it is the only path that gives styling with no app
change, and the only one that cannot cut. Worth offering, worth not defaulting to.

## 6. What the patch adds, and why in that shape

`android-patch/README.md` has the code. The design reasoning:

**Reuse the share pipeline rather than build a parallel one.** A raw job arrives as a shared file
with MIME type `application/vnd.escpos.raw`, which means it travels the existing
`SharedIntentHolder` → pull-on-mount → `buildIncomingJob` path unchanged. That path is already
written to survive a cold start, which a fresh receiver would have to re-solve.

**Mirror RawBT's `PRINT_RAWBT` shape.** Anyone who has integrated RawBT already knows
`base64,<bytes>` and an action constant. Inventing a different convention would make the two
libraries gratuitously incompatible.

**Keep the Kotlin dumb.** `ShareIntentReader` reports "here are some bytes, with this MIME type";
deciding what that means stays in TypeScript, where it can be unit tested without a device. This
is the same split the app already uses for shared text, and it matters more here, because the
Kotlin side cannot be compiled on this machine.

## 7. Verification status

**Verified:** the TypeScript side — 133 tests, typecheck, build, and a smoke test of the built
`dist/` exercising a full receipt through all three renderers and the URI builders.

**Not verified:** anything requiring a phone or the Android toolchain.

- The Kotlin in `android-patch/` has never been compiled. This machine has JDK 8 and 12;
  Capacitor 8 requires JDK 17+, and `compileSdk 35` is not installed. The same limitation is
  already recorded in `raw-thermal/docs/plans/2026-09-29-rawbt-parity-analysis.md` §7.
- The `intent:` hand-offs have not been launched on a device. The escaping is proven against a
  mirror of AOSP's parser, but Chrome's own pre-flight checks (package present, fallback
  handling, gesture requirement) are only described, not exercised.
- Whether the shipped Raw Thermal build resolves the `ACTION_SEND` filter for an intent with
  `package=` set is reasoned from the manifest and `Intent` resolution rules, not observed.

To check on a device:

```bash
# The raw receiver, once the patch is applied. "G0A=" is base64 of ESC @.
adb shell am start -a com.rawthermal.app.action.PRINT_RAW \
  --es com.rawthermal.app.extra.DATA "base64,G0A="
```

Then serve the playground to the phone and print a receipt through each transport in turn:

```bash
npm run build && HOST=0.0.0.0 npm run examples
```
