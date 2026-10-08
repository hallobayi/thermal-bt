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

  var VERSION = "1.2.0";

  /**
   * Nilai `mode` pada objek hasil. Dijadikan konstanta supaya pemanggil bisa
   * membandingkan `result.mode === RawThermal.MODES.ANDROID_INTENT` tanpa
   * menyalin string, dan salah tulis tidak lagi lolos sebagai perbandingan
   * yang selalu false.
   */
  var MODES = {
    ANDROID_INTENT: "android-intent",
    BROWSER: "browser",
    FALLBACK: "fallback",
    BROWSER_TEXT: "browser-text"
  };

  var DEFAULTS = {
    // Package Android Raw Thermal.
    packageName: "com.rawthermal.app",
    // URL yang dibuka kalau perangkat bukan Android ATAU kalau tidak ada
    // aplikasi yang bisa menangani Intent. null = pakai url asli.
    fallbackUrl: null,
    // true = buka di tab baru, false = tab yang sama.
    openInNewTab: true,
    // true = lepaskan object URL setelah dipakai (mencegah kebocoran memori).
    revokeObjectUrl: true,
    // true = dokumen printText langsung membuka dialog cetak saat dimuat.
    // Ini jalur cetak yang benar-benar bekerja di tablet Android, karena
    // dialog cetak Android menawarkan PrintService printer thermal.
    autoPrint: true
  };

  /**
   * Gabungkan opsi pemanggil di atas DEFAULTS tanpa memutasi kedua argumen.
   * Hanya kunci di dalam DEFAULTS yang diterima, sehingga opsi asing
   * (mis. `url`, `pdfUrl`) tidak bocor menjadi bagian dari request.
   */
  function withDefaults(options) {
    var source = options || {};
    var out = {};

    Object.keys(DEFAULTS).forEach(function (key) {
      out[key] = source[key] === undefined ? DEFAULTS[key] : source[key];
    });

    out.packageName = normalizePackageName(out.packageName);
    out.openInNewTab = out.openInNewTab !== false;
    out.autoPrint = out.autoPrint !== false;

    return out;
  }

  /**
   * Package kosong dulu menghasilkan `intent://…package=;` yang tampak sah
   * tetapi tidak akan pernah cocok dengan aplikasi mana pun. Lebih baik gagal
   * di sini dengan pesan yang jelas.
   */
  function normalizePackageName(value) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error("RawThermal: packageName harus berupa string yang tidak kosong.");
    }
    return value.trim();
  }

  return {
    VERSION: VERSION,
    MODES: MODES,
    DEFAULTS: DEFAULTS,
    withDefaults: withDefaults
  };
  /* @body-end */
});
