/*!
 * RawThermal JS — dokumen teks
 *
 * Browser tidak bisa mengirim byte ESC/POS langsung ke Raw Thermal, jadi
 * `printText` hanya membuat dokumen HTML minimal lalu membukanya. Modul ini
 * memisahkan pembuatan dokumen (murni) dari tindakan membukanya (DOM).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RawThermalText = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* @body-start */
  "use strict";

  var TITLE_FALLBACK = "Raw Thermal";

  var HTML_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  };

  /**
   * Gaya dokumen nota.
   *
   * Kenapa `viewport` wajib ada: dokumen ini dibuka di tab baru. Tanpa
   * `<meta name="viewport">`, Chrome Android memakai layout viewport ±980px
   * ("situs desktop"), sehingga nota tampak sangat kecil dan terpotong di
   * tablet. Dengan viewport + `text-size-adjust`, lebar mengikuti perangkat.
   *
   * Kenapa `@page`: dialog cetak Android memakai ukuran ini sebagai default,
   * jadi nota langsung pas untuk printer 58mm (384 dot) tanpa diubah manual.
   */
  var DOCUMENT_STYLES = [
    "html{-webkit-text-size-adjust:100%;text-size-adjust:100%}",
    "body{font-family:monospace;white-space:pre-wrap;margin:8mm;",
    "font-size:12px;line-height:1.35}",
    "@page{size:58mm auto;margin:4mm}",
    "@media print{body{margin:0}}"
  ].join("");

  /**
   * Dialog cetak Android adalah jalur yang benar-benar bekerja dari tablet:
   * PrintService printer thermal muncul sebagai tujuan cetak. Skrip ini bisa
   * diblokir kalau halaman pemanggil punya CSP ketat — dalam kasus itu nota
   * tetap terbuka dan tombol cetak browser masih bisa dipakai.
   */
  var AUTO_PRINT_SCRIPT =
    "<script>window.addEventListener(\"load\",function(){window.print();});<\/script>";

  function escapeHtml(value) {
    return String(value).replace(/[&<>]/g, function (ch) {
      return HTML_ESCAPES[ch];
    });
  }

  /**
   * Bungkus teks apa adanya ke dokumen HTML siap cetak. Monospace +
   * `pre-wrap` supaya perataan kolom struk tetap terjaga.
   */
  function buildTextDocument(text, title, options) {
    var opts = options || {};
    var head = [
      "<!doctype html>",
      "<html lang=\"id\"><head>",
      "<meta charset=\"utf-8\">",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
      "<title>" + escapeHtml(title || TITLE_FALLBACK) + "</title>",
      "<style>" + DOCUMENT_STYLES + "</style>"
    ];

    if (opts.autoPrint !== false) head.push(AUTO_PRINT_SCRIPT);

    return head
      .concat(["</head><body>", escapeHtml(text), "</body></html>"])
      .join("");
  }

  return {
    escapeHtml: escapeHtml,
    buildTextDocument: buildTextDocument
  };
  /* @body-end */
});
