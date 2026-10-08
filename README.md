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

String `mode` juga tersedia sebagai konstanta, supaya salah tulis tidak lolos
sebagai perbandingan yang selalu `false`:

```javascript
if (hasil.mode === RawThermal.MODES.ANDROID_INTENT) { /* … */ }
```

### Perilaku di tablet Android

- **`fallbackUrl` dipakai di kedua platform.** Saat Android, URL itu dipasang
  sebagai `S.browser_fallback_url` di dalam Intent. Kalau aplikasi Raw Thermal
  belum terpasang (atau tidak ada activity yang cocok), Chrome membuka PDF-nya
  di browser, bukan menampilkan "aplikasi tidak ditemukan" atau diam saja.
- **Deteksi Android mengenali tablet mode "situs desktop".** Tablet yang
  mengirim UA desktop (`X11; Linux x86_64`) tetap dikenali dari
  `navigator.maxTouchPoints`. Catatan: `navigator.userAgentData.mobile`
  bernilai `false` di tablet — nilai itu **tidak** dipakai untuk menolak.
- **Popup yang diblokir tidak langsung menyerah.** Kalau `window.open` ditolak
  (umum di WebView/PWA Android), URL dicoba lagi lewat anchor sementara.
- **Anchor `intent://` diletakkan di luar layar**, bukan `display:none`, karena
  WebView Android lama tidak menjalankan klik pada elemen yang tidak dirender.

### `RawThermal.buildViewIntent(url, options)`

Menghasilkan string Intent untuk debugging. **Tidak** memicu Intent apa pun.
Stringnya identik dengan yang benar-benar dikirim, termasuk
`S.browser_fallback_url`.

```javascript
RawThermal.buildViewIntent("/kasir/nota.pdf");
// "intent://kasir.example.com/kasir/nota.pdf#Intent;scheme=https;…;end"
```

### `RawThermal.printText(text, options)`

Membuka teks sebagai dokumen HTML di browser. Ini BUKAN raw ESC/POS printing.
Dokumennya sudah siap cetak dari tablet Android: ada `meta viewport`, aturan
`@page{size:58mm auto}` untuk printer 58mm, dan (kalau `autoPrint` tidak
dimatikan) langsung membuka dialog cetak Android begitu dokumen dimuat.

```javascript
RawThermal.printText("Total  10.000", { openInNewTab: true });
```

Kalau halaman Anda punya CSP ketat, skrip cetak otomatis itu bisa diblokir —
dokumennya tetap terbuka dan tombol cetak browser masih bisa dipakai. Matikan
lewat `{ autoPrint: false }` kalau memang tidak ingin dialog muncul.

### `RawThermal.printBase64()`

Selalu melempar error karena Raw Thermal tidak menyediakan browser URI resmi
yang setara dengan `rawbt:` untuk Base64 ESC/POS. Fungsi ini dipertahankan agar
pemanggil lama mendapat pesan yang jelas, bukan gagal senyap.

## Options

| Opsi | Default | Keterangan |
| --- | --- | --- |
| `packageName` | `"com.rawthermal.app"` | Package Android Raw Thermal. Wajib string tidak kosong. |
| `fallbackUrl` | `null` | URL cadangan. Dipakai kalau perangkat bukan Android, dan dipasang sebagai `S.browser_fallback_url` saat Android. `null` = pakai `url` asli. |
| `openInNewTab` | `true` | `false` untuk membuka di tab yang sama. |
| `revokeObjectUrl` | `true` | Lepaskan object URL `printText` setelah dipakai. |
| `autoPrint` | `true` | Dokumen `printText` langsung membuka dialog cetak saat dimuat. |

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
npm test          # 49 uji, memakai runner bawaan Node (tanpa dependensi)
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

## Jalur cetak dari tablet Android

Urutan yang disarankan, dari yang paling andal:

1. **`printUrl(url)`** — serahkan PDF ke aplikasi Raw Thermal lewat Intent.
   Kalau aplikasinya tidak ada, `fallbackUrl`/URL PDF terbuka di browser
   (lihat `S.browser_fallback_url` di atas).
2. **`printText(teks)`** — dokumen nota + dialog cetak Android, lalu pilih
   printer thermal di daftar PrintService. Ini jalur yang paling pasti bekerja
   dari browser tanpa aplikasi tambahan.
3. Base64 ESC/POS langsung dari browser **tidak mungkin** di platform browser
   (Bluetooth Classic SPP tidak dijangkau JS) — butuh native bridge.

### Kenapa `meta viewport` penting di tablet

Dokumen nota dibuka di tab baru. Tanpa `<meta name="viewport">`, Chrome Android
memakai layout viewport ±980px ("situs desktop"), sehingga nota dirender
diperkecil. Diukur di Edge headless dengan emulasi tablet 800×1280:

| Versi | Layout viewport | Skala tampilan | Tinggi teks |
| --- | --- | --- | --- |
| tanpa viewport (lama) | 980px | 0.816 | ≈ 9,8px |
| dengan viewport (sekarang) | 800px | 1 | 12px |

## Catatan

Raw Thermal berbeda dari RawBT. RawBT memiliki pola URI `rawbt:` yang umum dipakai untuk mengirim data dari browser. Raw Thermal saat ini lebih berorientasi pada Android Print Service / Android document intents. Karena itu library ini tidak berpura-pura mendukung Base64 ESC/POS jika aplikasi target tidak menyediakan API tersebut.

Jika kebutuhan Anda adalah:
PWA -> klik cetak -> tanpa dialog -> langsung Bluetooth printer,
maka dibutuhkan native Android bridge/Intent khusus pada aplikasi Raw Thermal.
