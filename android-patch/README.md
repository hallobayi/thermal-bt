# Making Raw Thermal accept raw ESC/POS from a web page

## Why this is needed

`thermal-bt` can hand a receipt to Raw Thermal in two ways today, and neither gives full parity
with RawBT:

| Path | Works with the app as shipped | What survives |
|---|---|---|
| `rawthermal-share` | yes | Text only. No bold, no barcodes, no cutting, no cash drawer |
| `rawthermal-raw` | **no — needs this patch** | Everything |

The reason the shipped app cannot take a raw byte stream is one specific code path. A web page
can only reach Raw Thermal through an `ACTION_SEND` intent, and the app turns that into a
document via `printTextDocument()`:

```ts
// src/composables/usePrint.ts
encoder.initialize()
encoder.align('left')
encoder.textBlock(content, columns.value)   // <- wraps to the paper width, encodes per code page
encoder.feed(...)
if (settings.autoCut) encoder.cut()
```

`textBlock` wraps the text and encodes it through the app's own code page. An ESC/POS byte stream
cannot survive that:

- `ESC` (0x1B) is not in the code page table, so it is replaced with `?`.
- The wrapping inserts line breaks wherever the stream crosses a column boundary, which lands in
  the middle of command sequences.
- The app prepends its own `initialize()` and appends its own `feed()`/`cut()`.

So this is not a matter of encoding the payload better. The app needs a second entry point that
means "these bytes are the print job; write them to the printer unchanged".

## What the patch adds

A `PRINT_RAW` action that mirrors RawBT's `PRINT_RAWBT` contract, so anyone who has integrated
RawBT recognises the shape immediately.

```
action  com.rawthermal.app.action.PRINT_RAW
extra   com.rawthermal.app.extra.DATA = "base64,<raw ESC/POS bytes>"
```

The patch reuses the machinery that is already there — `SharedIntentHolder`, the pull-on-mount
flow, the pending-job queue — instead of adding a parallel path. A raw job arrives as a shared
*file* whose MIME type is `application/vnd.escpos.raw`, which is a one-line addition to the
existing type classifier.

## Files to change in the Raw Thermal project

### 1. `android/app/src/main/AndroidManifest.xml`

Add this filter to `MainActivity`, next to the existing ones.

Note there is deliberately **no `<data>` element**: an intent with no type or data only matches a
filter that also declares none. Adding a `mimeType` here would stop the action from resolving.

```xml
<!--
    Raw ESC/POS from an external app or a web page.

    Web pages cannot attach a file to a share intent, so this is the only way a browser can
    hand over a byte stream. Mirrors RawBT's PRINT_RAWBT action.
-->
<intent-filter>
    <action android:name="com.rawthermal.app.action.PRINT_RAW" />
    <category android:name="android.intent.category.DEFAULT" />
</intent-filter>
```

### 2. `android/app/src/main/java/com/rawthermal/app/share/ShareIntentReader.kt`

Add the action constant and the reader. Insert the new `when` branch and the function.

```kotlin
object ShareIntentReader {

    /** Action carrying a raw ESC/POS stream, from `thermal-bt` or any other external caller. */
    const val ACTION_PRINT_RAW = "com.rawthermal.app.action.PRINT_RAW"

    /** String extra holding `base64,<raw bytes>`. */
    const val EXTRA_RAW_DATA = "com.rawthermal.app.extra.DATA"

    /** Marks a payload that must reach the printer as bytes rather than as text. */
    const val RAW_MIME_TYPE = "application/vnd.escpos.raw"

    fun read(context: Context, intent: Intent?): SharedIntentPayload? {
        if (intent == null) return null

        return when (intent.action) {
            ACTION_PRINT_RAW -> readRaw(intent)
            Intent.ACTION_SEND -> readSend(context, intent)
            Intent.ACTION_VIEW -> readUri(context, intent.data, intent.type)
            else -> null
        }
    }

    /**
     * Decode a `base64,<bytes>` payload.
     *
     * The `base64,` prefix is kept because RawBT uses it, so callers that already build that
     * string for RawBT need no change. The prefix is optional here.
     */
    private fun readRaw(intent: Intent): SharedIntentPayload? {
        val data = intent.getStringExtra(EXTRA_RAW_DATA) ?: return null
        val encoded = data.removePrefix("base64,").filterNot { it.isWhitespace() }
        if (encoded.isEmpty()) return null

        return SharedIntentPayload(
            name = "receipt.escpos",
            mimeType = RAW_MIME_TYPE,
            base64 = encoded
        )
    }
}
```

`SharedIntentPayload` needs no new field: `base64` already means "these are the bytes".

### 3. `android/app/src/main/java/com/rawthermal/app/MainActivity.kt`

No change needed. `handleIncomingIntent` already calls `ShareIntentReader.read` for anything that
is not `SETUP_PRINTER_FOR_PRINT`, and the new action falls through to it.

### 4. `src/services/file/fileTypes.ts`

```ts
export const SUPPORTED_TYPES = {
  // ...existing entries...
  'application/vnd.escpos.raw': 'raw'
} as const

export const EXTENSION_TYPES: Record<string, 'pdf' | 'image' | 'text' | 'raw'> = {
  // ...existing entries...
  escpos: 'raw'
}
```

`SelectedFile.type` widens from `'pdf' | 'image' | 'text'` to include `'raw'`.

### 5. `src/services/share/sharedPayload.ts`

```ts
const MIME_EXTENSIONS: Record<string, string> = {
  // ...existing entries...
  'application/vnd.escpos.raw': 'escpos'
}
```

### 6. `src/composables/useFilePrint.ts`

A raw job has nothing to preview and nothing to rasterise: the bytes already are the print job.

```ts
async function loadRawFile(file: SelectedFile) {
  loadingMessage.value = `Ready to send ${formatFileSize(file.size)} of ESC/POS`
}

async function printRawDocument(file: SelectedFile): Promise<boolean> {
  const bytes = new Uint8Array(await file.blob.arrayBuffer())
  await printRaw(bytes)
  return true
}
```

Wire both into the existing `loadFile` / `printSelected` switches. `printRaw` is already exported
by `usePrintService()` and already refuses to run without a connected printer, which is the right
guard: a raw stream has no fallback.

### 7. `src/views/FilePrintView.vue`

A small panel for the raw case — byte count, no preview, and a note that the job is sent as-is.

## Verification this patch still needs

**The Kotlin has not been compiled.** This machine has only JDK 8 and 12; Capacitor 8 requires
JDK 17+, and `compileSdk 35` is not installed. The same limitation is already recorded in
`docs/plans/2026-09-29-rawbt-parity-analysis.md` section 7.

What has been checked by hand:

- The manifest filter has no `<data>` element, so it matches an intent that carries neither a
  type nor data. This is the opposite of the existing filters, which is why the difference is
  worth calling out.
- `Intent.getStringExtra` returns `null` for a missing extra, so a malformed caller is rejected
  rather than crashing.
- The `base64,` prefix handling matches what `thermal-bt`'s `buildRawThermalRawUri` emits.

What must be checked on a device:

1. `adb shell am start -a com.rawthermal.app.action.PRINT_RAW --es com.rawthermal.app.extra.DATA "base64,G0A="`
   should open the app with a raw job loaded. (`G0A=` is `ESC @`.)
2. A page using `thermal-bt`'s `rawthermal-raw` transport should print with no tap beyond the
   browser's own.
3. A receipt with a barcode, a cut and a drawer kick should produce all three.
