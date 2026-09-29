# RawThermal JS

Library JavaScript ringan untuk PWA/browser yang ingin menyerahkan URL PDF nota ke aplikasi Raw Thermal di Android.

## Instalasi

```html
<script src="/assets/js/rawthermal.js"></script>
```

Atau lewat Node/bundler:

```js
const RawThermal = require("rawthermal-js");
```

## Cetak PDF

```javascript
RawThermal.printUrl("/kasir/generateNotaBayar?no_invoice=INV001");
```

atau:

```javascript
RawThermal.print({
  url: "/kasir/generateNotaBayar?no_invoice=INV001",
  packageName: "com.rawthermal.app"
});
```

## API

### `RawThermal.isAndroid()`

```javascript
if (RawThermal.isAndroid()) {
  // Android
}
```

### `RawThermal.printUrl(url, options)`

Membangun Android Intent VIEW untuk PDF. `url` boleh relatif; akan diresolusi
terhadap `window.location.href`.

```javascript
RawThermal.printUrl("/kasir/generateNotaBayar?no_invoice=INV001", {
  packageName: "com.rawthermal.app"
});
```

Mengembalikan objek hasil:

```javascript
{ ok: true,  mode: "android-intent", intent: "intent://…" }
{ ok: true,  mode: "browser" }                  // bukan Android
{ ok: true,  mode: "fallback" }                 // fallbackUrl dipakai
{ ok: false, mode: "browser", target: "_blank" } // popup diblokir
```

### `RawThermal.buildViewIntent(url, options)`

Menghasilkan string Intent untuk debugging. **Tidak** memicu Intent apa pun.

```javascript
RawThermal.buildViewIntent("/kasir/nota.pdf");
// "intent://kasir.example.com/kasir/nota.pdf#Intent;scheme=https;…;end"
```

### `RawThermal.printText(text, options)`

Membuka teks sebagai dokumen HTML di browser. Ini BUKAN raw ESC/POS printing.

```javascript
RawThermal.printText("Total  10.000", { openInNewTab: true });
```

### `RawThermal.printBase64()`

Selalu melempar error karena Raw Thermal tidak menyediakan browser URI resmi
yang setara dengan `rawbt:` untuk Base64 ESC/POS. Fungsi ini dipertahankan agar
pemanggil lama mendapat pesan yang jelas, bukan gagal senyap.

## Options

| Opsi | Default | Keterangan |
| --- | --- | --- |
| `packageName` | `"com.rawthermal.app"` | Package Android Raw Thermal. Wajib string tidak kosong. |
| `fallbackUrl` | `null` | URL yang dibuka kalau perangkat bukan Android. `null` = pakai `url` asli. |
| `openInNewTab` | `true` | `false` untuk membuka di tab yang sama. |
| `revokeObjectUrl` | `true` | Lepaskan object URL `printText` setelah dipakai. |

## Integrasi CI4

Endpoint nota cukup mengembalikan atau menyediakan PDF:

```text
/kasir/generateNotaBayar?no_invoice=INV001
```

Kemudian:

```javascript
function cetakNotaRawbt(noInvoice) {
  RawThermal.printUrl(
    "/kasir/generateNotaBayar?no_invoice=" + encodeURIComponent(noInvoice)
  );
}
```

Nama fungsi `cetakNotaRawbt()` boleh dipertahankan agar kode tombol lama tidak perlu banyak diubah.

## Pengembangan

```bash
npm run build     # src/*.js  ->  dist/rawthermal.js + .min.js + .cjs
npm test          # 32 uji, memakai runner bawaan Node (tanpa dependensi)
npm run verify    # build lalu test
```

### Struktur

```text
src/
  config.js     nilai default + normalisasi opsi
  platform.js   deteksi Android (murni)
  intent.js     pembuat string intent:// (murni)
  text.js       dokumen HTML untuk printText (murni)
  dom.js        satu-satunya lapisan yang menyentuh window/document
  index.js      API publik RawThermal
test/
  rawthermal.test.js   uji modul sumber
  bundle.test.js       uji dist/ hasil build di dalam window tiruan
```

`build.js` menggabungkan `src/*.js` menjadi satu bundel browser. Karena itu
**jangan menyunting `dist/` langsung** — sunting `src/`, lalu jalankan
`npm run build`.

Setiap modul sumber memakai pola UMD kecil dan menandai isi factory-nya dengan
komentar `/* @body-start */` dan `/* @body-end */`. Penanda itu dibaca oleh
`build.js`; jangan dihapus.

## Catatan

Raw Thermal berbeda dari RawBT. RawBT memiliki pola URI `rawbt:` yang umum dipakai untuk mengirim data dari browser. Raw Thermal saat ini lebih berorientasi pada Android Print Service / Android document intents. Karena itu library ini tidak berpura-pura mendukung Base64 ESC/POS jika aplikasi target tidak menyediakan API tersebut.

Jika kebutuhan Anda adalah:
PWA -> klik cetak -> tanpa dialog -> langsung Bluetooth printer,
maka dibutuhkan native Android bridge/Intent khusus pada aplikasi Raw Thermal.
