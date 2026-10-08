/*!
 * RawThermal JS — orkestrasi API publik
 *
 * Aturan yang dijaga di sini:
 * - API publik lama (printUrl, print, printText, printBase64, isAndroid,
 *   buildViewIntent) tetap ada dan kompatibel, karena tombol lama di
 *   aplikasi pemakai masih memanggilnya.
 * - Opsi pemanggil dinormalisasi sekali lewat withDefaults(), sehingga opsi
 *   asing seperti `url`/`pdfUrl` tidak ikut menjadi bagian request.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./config.js"),
      require("./platform.js"),
      require("./intent.js"),
      require("./text.js"),
      require("./dom.js")
    );
  } else {
    root.RawThermal = factory(
      root.RawThermalConfig,
      root.RawThermalPlatform,
      root.RawThermalIntent,
      root.RawThermalText,
      root.RawThermalDom
    );
  }
}(typeof self !== "undefined" ? self : this, function (config, platform, intent, text, dom) {
  /* @body-start */
  "use strict";

  var withDefaults = config.withDefaults;
  var toAbsoluteUrl = intent.toAbsoluteUrl;
  var MODES = config.MODES;

  var DOCUMENT_TITLE = "Raw Thermal";

  /**
   * Titik masuk tunggal untuk menyerahkan PDF ke Raw Thermal.
   *
   * Tiga jalur, dalam urutan percobaan:
   *   1. Android  -> Intent VIEW ke package Raw Thermal, dengan fallback
   *      browser supaya tablet yang belum memasang aplikasinya tetap dapat PDF.
   *   2. Lainnya  -> buka URL PDF (atau fallbackUrl) di tab browser.
   */
  function launch(url, options) {
    var opts = withDefaults(options);
    // Satu URL tujuan cadangan untuk kedua jalur: dipakai saat perangkat
    // bukan Android, dan dipasang sebagai browser fallback Intent saat Android.
    var fallbackTarget = opts.fallbackUrl || url;

    if (!platform.isAndroid()) {
      var opened = dom.openUrl(toAbsoluteUrl(fallbackTarget), opts);
      return {
        ok: opened.opened,
        mode: opts.fallbackUrl ? MODES.FALLBACK : MODES.BROWSER,
        target: opened.target
      };
    }

    var built = intent.buildViewIntent(url, opts.packageName, {
      browserFallbackUrl: toAbsoluteUrl(fallbackTarget)
    });

    if (!dom.clickIntent(built)) {
      return {
        ok: false,
        mode: MODES.ANDROID_INTENT,
        intent: built,
        reason: "no-document"
      };
    }
    return { ok: true, mode: MODES.ANDROID_INTENT, intent: built };
  }

  function printUrl(url, options) {
    return launch(url, options);
  }

  /**
   * Bentuk serbaguna: string | { url } | { pdfUrl }.
   * Hanya `url` hasil resolusi yang diteruskan, opsi lain dibersihkan.
   */
  function print(options) {
    if (options === null || options === undefined) {
      throw new Error("RawThermal.print membutuhkan options.");
    }
    if (typeof options === "string") {
      return printUrl(options, {});
    }

    var url = options.url || options.pdfUrl;
    if (!url) {
      throw new Error("Gunakan { url: '/path/nota.pdf' }.");
    }
    return printUrl(url, options);
  }

  /**
   * Teks dibuka sebagai dokumen HTML. Ini BUKAN raw ESC/POS printing —
   * Raw Thermal saat ini hanya menerima Intent PDF. Dokumennya membawa
   * viewport + aturan cetak 58mm, jadi dialog cetak Android bisa dipakai
   * langsung dari tablet.
   */
  function printText(value, options) {
    var opts = withDefaults(options);
    var onAndroid = platform.isAndroid();
    var html = text.buildTextDocument(value, DOCUMENT_TITLE, opts);
    var result = dom.openTextDocument(html, opts);

    var response = {
      ok: result.opened,
      mode: onAndroid ? MODES.BROWSER_TEXT : MODES.BROWSER,
      objectUrl: result.objectUrl
    };

    if (onAndroid) {
      response.message = "Untuk Raw Thermal gunakan printUrl() dengan PDF.";
    }
    return response;
  }

  /**
   * Selalu melempar: Raw Thermal belum menyediakan URI browser resmi untuk
   * Base64 ESC/POS. Dibiarkan ada agar pemanggil lama mendapat pesan jelas.
   */
  function printBase64() {
    throw new Error(
      "Raw Thermal saat ini tidak menyediakan browser URI resmi untuk Base64 ESC/POS. " +
        "Gunakan printUrl() dengan PDF, atau buat native Android bridge."
    );
  }

  /** String Intent untuk debugging, tanpa memicu Intent apa pun. */
  function buildViewIntent(url, options) {
    var opts = withDefaults(options);
    return intent.buildViewIntent(url, opts.packageName, {
      browserFallbackUrl: toAbsoluteUrl(opts.fallbackUrl || url)
    });
  }

  return {
    version: config.VERSION,
    MODES: MODES,
    isAndroid: platform.isAndroid,
    print: print,
    printUrl: printUrl,
    printText: printText,
    printBase64: printBase64,
    buildViewIntent: buildViewIntent
  };
  /* @body-end */
});
