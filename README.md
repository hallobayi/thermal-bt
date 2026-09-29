# RawThermal JS

Library JavaScript ringan untuk PWA/browser yang ingin menyerahkan URL PDF nota ke aplikasi Raw Thermal di Android.

## Instalasi

```html
<script src="/assets/js/rawthermal.js"></script>
```

## Cetak PDF

```javascript
RawThermal.printUrl(
  "/kasir/generateNotaBayar?no_invoice=INV001"
);
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

Membangun Android Intent VIEW untuk PDF.

```javascript
RawThermal.printUrl("/kasir/generateNotaBayar?no_invoice=INV001", {
  packageName: "com.rawthermal.app"
});
```

### `RawThermal.buildViewIntent(url, options)`

Menghasilkan string Intent untuk debugging.

### `RawThermal.printText(text)`

Membuka teks sebagai dokumen HTML di browser. Ini BUKAN raw ESC/POS printing.

### `RawThermal.printBase64(base64)`

Sengaja melempar error karena Raw Thermal tidak menyediakan browser URI resmi yang setara dengan `rawbt:` untuk Base64 ESC/POS.

## Integrasi CI4

Endpoint nota cukup mengembalikan atau menyediakan PDF:

```text
/kasir/generateNotaBayar?no_invoice=INV001
```

Kemudian:

```javascript
function cetakNotaRawbt(noInvoice) {
  RawThermal.printUrl(
    "/kasir/generateNotaBayar?no_invoice=" +
    encodeURIComponent(noInvoice)
  );
}
```

Nama fungsi `cetakNotaRawbt()` boleh dipertahankan agar kode tombol lama tidak perlu banyak diubah.

## Catatan

Raw Thermal berbeda dari RawBT. RawBT memiliki pola URI `rawbt:` yang umum dipakai untuk mengirim data dari browser. Raw Thermal saat ini lebih berorientasi pada Android Print Service / Android document intents. Karena itu library ini tidak berpura-pura mendukung Base64 ESC/POS jika aplikasi target tidak menyediakan API tersebut.

Jika kebutuhan Anda adalah:
PWA -> klik cetak -> tanpa dialog -> langsung Bluetooth printer,
maka dibutuhkan native Android bridge/Intent khusus pada aplikasi Raw Thermal.
