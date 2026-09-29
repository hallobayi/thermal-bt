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

  var HTML_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>]/g, function (ch) {
      return HTML_ESCAPES[ch];
    });
  }

  /**
   * Bungkus teks apa adanya ke dokumen HTML siap cetak. Monospace +
   * `pre-wrap` supaya perataan kolom struk tetap terjaga.
   */
  function buildTextDocument(text, title) {
    return (
      "<!doctype html><html><head><meta charset='utf-8'>" +
      "<title>" + escapeHtml(title || "Raw Thermal") + "</title>" +
      "<style>body{font-family:monospace;white-space:pre-wrap;" +
      "margin:8mm;font-size:12px}</style>" +
      "</head><body>" + escapeHtml(text) + "</body></html>"
    );
  }

  return {
    escapeHtml: escapeHtml,
    buildTextDocument: buildTextDocument
  };
  /* @body-end */
});
