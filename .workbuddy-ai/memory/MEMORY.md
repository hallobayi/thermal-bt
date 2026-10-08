# MEMORY — thermal-bt (rawthermal-js)

## Proyek

Library JS tanpa dependensi: PWA/browser menyerahkan URL PDF nota ke aplikasi
**Raw Thermal** di Android lewat Android VIEW Intent (`intent://…#Intent;`).
Berbeda dari **RawBT** yang punya pola URI `rawbt:` — Raw Thermal tidak punya,
jadi Base64 ESC/POS memang tidak didukung (dijadikan error yang jelas, bukan
gagal senyap).

Repo: remote `origin` = `github.com/hallobayi/thermal-bt`, branch `main`, dan
repo itu **publik**. Catatan lama yang menulis `mdestafadilah/thermal-bt`
(private) **salah** — dikoreksi 2026-10-08 lewat `git remote -v` + `gh repo view`.
Konsekuensinya: `.workbuddy-ai/memory/` ikut ter-commit dan ikut terlihat
publik (sudah begitu sejak commit `d32e26b`), jadi jangan pernah menulis
kredensial, token, atau data pelanggan ke dalamnya.

## Arsitektur

- `src/*.js` adalah sumber tunggal. `dist/` adalah hasil build — **jangan
  disunting langsung**.
- `src/dom.js` adalah satu-satunya file yang boleh menyentuh `window`/
  `document`. Modul lain harus murni supaya bisa dites tanpa browser.
- `src/config.js` adalah satu-satunya tempat normalisasi opsi. Kunci di luar
  `DEFAULTS` sengaja dibuang agar tidak bocor jadi bagian request.
- Setiap modul sumber menandai isi factory dengan `/* @body-start */` dan
  `/* @body-end */`. `build.js` membaca penanda itu. **Jangan dihapus.**

## API publik yang WAJIB stabil

`printUrl`, `print`, `printText`, `printBase64`, `isAndroid`,
`buildViewIntent`, `version` — tombol lama di aplikasi CI4 masih memanggilnya
(di README lama namanya `cetakNotaRawbt()`). Sejak v1.2.0 ada tambahan
`MODES` (konstanta `mode` hasil, mis. `RawThermal.MODES.ANDROID_INTENT`).

## Tablet Android (v1.2.0)

- Deteksi: `maxTouchPoints` **sebelum** `ontouchstart`, karena tablet mode
  "situs desktop" mengirim UA `X11; Linux x86_64` tanpa kata Android.
  Jangan pakai `userAgentData.mobile` untuk menolak — nilainya `false` di tablet.
- `fallbackUrl` dipakai di kedua platform: sebagai URL browser saat bukan
  Android, dan sebagai `S.browser_fallback_url` di string Intent saat Android.
  Konsekuensinya string Intent berakhir `…;package=…;S.browser_fallback_url=…;end`.
- Dokumen `printText` wajib punya `<meta name="viewport">` + `@page{size:58mm auto}`;
  tanpanya Chrome Android memakai layout viewport 980px (teks jadi ~0.82×).
- `window.open` TIDAK BOLEH diberi features `"noopener"`: browser
  mengembalikan `null` sehingga keberhasilan terbaca sebagai kegagalan.
  Putus opener dengan `ref.opener = null`.
- Anchor sementara (Intent & fallback popup) diletakkan off-screen, bukan
  `display:none` — WebView Android lama tidak mengklik elemen tak dirender.

## Perintah

```bash
npm run build   # src/ -> dist/rawthermal.js + .min.js + .cjs
npm test        # 49 uji, runner bawaan Node, tanpa dependensi
npm run verify  # build + test
```

## Aturan build (dari pengalaman pahit)

- Ekstraksi body factory HARUS lewat penanda `@body-start`/`@body-end`.
  Mencari `});` terakhir atau `{` pertama pernah menghasilkan bundel rusak
  yang tetap "sukses dibuild".
- Modul IIFE wajib menugaskan hasilnya: `global.RawThermalX = (function () {…})();`.
- Entry factory menerima argumen dari `global.RawThermal*`, bukan variabel lokal.
- Setelah menambah modul: tambahkan namanya ke `MODULES` di `build.js` dan
  pastikan `globalName()` menghasilkan nama yang diharapkan.
- `vm.createContext(win)` tidak membagikan objek host — baca hasil lewat
  `vm.runInContext("RawThermal", ctx)`.

## Aplikasi target & printer (penting, sering disalahpahami)

- **Aplikasi target**: `github.com/syofyanzuhad/raw-thermal` (APK open source,
  Capacitor + Vue 3, package `com.rawthermal.app`) — **bukan** aplikasi Raw
  Thermal dari Play Store. MainActivity-nya menerima `ACTION_VIEW`/`ACTION_SEND`
  untuk `application/pdf` dan `image/*`, **tanpa** custom scheme dan **tanpa**
  API handoff URL/Base64.
- **Printer**: iware ZJ-5809 II (= Shenzhen Zijiang ZJ-5809, dijual juga sebagai
  NETUM/FixPrint). 58mm, 384 dot, 203dpi, **mendukung ESC/POS**, Bluetooth 4.0
  dengan SPP.

### Tiga kebenaran yang jangan dicampur

1. Printer mendukung ESC/POS → benar.
2. Browser tidak bisa mengirim byte ESC/POS ke Bluetooth Classic SPP → benar.
   Karena itu `printBase64()` sengaja selalu melempar error; itu bukan bug dan
   bukan keterbatasan printer, melainkan keterbatasan platform browser.
3. Aplikasi target **tidak menerima URL** dari browser. Ia menerima dokumen
   lewat Android print framework atau share/VIEW Intent berupa file. Jadi
   `intent://…#Intent;type=application/pdf;package=…;end` belum terbukti
   memicu cetak — **wajib diverifikasi di perangkat nyata** sebelum dijanjikan
   ke pengguna.

Jalur yang benar-benar tanpa dialog: Android **Print Service** (buka
`window.print()` / print dialog Android → pilih printer thermal) atau native
Capacitor plugin yang memanggil BLE GATT langsung.

## Konvensi

Commit memakai Conventional Commits, deskripsi bahasa Indonesia, badan commit
menjelaskan *kenapa*. Pesan error dan komentar untuk pengguna dalam bahasa
Indonesia.
