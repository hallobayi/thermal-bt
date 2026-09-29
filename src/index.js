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

  /**
   * Titik masuk tunggal untuk menyerahkan PDF ke Raw Thermal.
   * Bukan Android (atau URL gagal dibentuk) → jatuh ke fallbackUrl/url asli.
   */
  function launch(url, options) {
    var opts = withDefaults(options);

    if (!platform.isAndroid()) {
      var target = opts.fallbackUrl || url;
      var nonAndroid = dom.openUrl(toAbsoluteUrl(target), opts);
      return {
        ok: nonAndroid.opened,
        mode: opts.fallbackUrl ? "fallback" : "browser",
        target: nonAndroid.target
      };
    }

    var built = intent.buildViewIntent(url, opts.packageName);
    var sent = dom.clickIntent(built);
    if (!sent) {
      return { ok: false, mode: "android-intent", intent: built, reason: "no-document" };
    }
    return { ok: true, mode: "android-intent", intent: built };
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
   * Raw Thermal saat ini hanya menerima Intent PDF.
   */
  function printText(value, options) {
    var opts = withDefaults(options);
    var html = text.buildTextDocument(value, "Raw Thermal");
    var result = dom.openTextDocument(html, opts);

    var response = {
      ok: result.opened,
      mode: platform.isAndroid() ? "browser-text" : "browser",
      objectUrl: result.objectUrl
    };

    if (platform.isAndroid()) {
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
    return intent.buildViewIntent(url, withDefaults(options).packageName);
  }

  return {
    version: config.VERSION,
    isAndroid: platform.isAndroid,
    print: print,
    printUrl: printUrl,
    printText: printText,
    printBase64: printBase64,
    buildViewIntent: buildViewIntent
  };
  /* @body-end */
});
