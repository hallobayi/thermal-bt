/*!
 * RawThermal JS — konfigurasi
 *
 * Nilai default dan normalisasi opsi dipusatkan di sini supaya setiap
 * entry point (printUrl, print, printText) memakai aturan yang sama.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RawThermalConfig = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* @body-start */
  "use strict";

  var VERSION = "1.1.0";

  var DEFAULTS = {
    // Package Android Raw Thermal.
    packageName: "com.rawthermal.app",
    // URL yang dibuka kalau perangkat bukan Android. null = pakai url asli.
    fallbackUrl: null,
    // true = buka di tab baru, false = tab yang sama namanya.
    openInNewTab: true,
    // true = lepaskan object URL setelah dipakai (mencegah kebocoran memori).
    revokeObjectUrl: true
  };

  /**
   * Gabungkan opsi pemanggil di atas DEFAULTS tanpa memutasi kedua argumen.
   * Hanya kunci di dalam DEFAULTS yang diterima, sehingga opsi asing
   * (mis. `url`, `pdfUrl`) tidak bocor menjadi bagian dari request.
   */
  function withDefaults(options) {
    var out = {};
    var source = options || {};

    Object.keys(DEFAULTS).forEach(function (key) {
      out[key] = source[key] === undefined ? DEFAULTS[key] : source[key];
    });

    if (typeof out.packageName !== "string" || out.packageName.trim() === "") {
      throw new Error(
        "RawThermal: packageName harus berupa string yang tidak kosong."
      );
    }
    out.packageName = out.packageName.trim();

    out.openInNewTab = out.openInNewTab !== false;

    return out;
  }

  return {
    VERSION: VERSION,
    DEFAULTS: DEFAULTS,
    withDefaults: withDefaults
  };
  /* @body-end */
});
