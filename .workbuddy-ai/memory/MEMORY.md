# MEMORY — thermal-bt (rawthermal-js)

## Proyek

Library JS tanpa dependensi: PWA/browser menyerahkan URL PDF nota ke aplikasi
**Raw Thermal** di Android lewat Android VIEW Intent (`intent://…#Intent;`).
Berbeda dari **RawBT** yang punya pola URI `rawbt:` — Raw Thermal tidak punya,
jadi Base64 ESC/POS memang tidak didukung (dijadikan error yang jelas, bukan
gagal senyap).

Repo: `github.com/mdestafadilah/thermal-bt` (private).

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
(di README lama namanya `cetakNotaRawbt()`).

## Perintah

```bash
npm run build   # src/ -> dist/rawthermal.js + .min.js + .cjs
npm test        # 32 uji, runner bawaan Node, tanpa dependensi
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

## Konvensi

Commit memakai Conventional Commits, deskripsi bahasa Indonesia, badan commit
menjelaskan *kenapa*. Pesan error dan komentar untuk pengguna dalam bahasa
Indonesia.
