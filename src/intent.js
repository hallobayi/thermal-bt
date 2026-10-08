/*!
 * RawThermal JS — Intent builder
 *
 * Raw Thermal tidak mengekspos pola URI `rawbt:` seperti RawBT, sehingga
 * jalur yang didukung adalah Android VIEW Intent ke MIME application/pdf.
 * Bagian ini murni (tidak menyentuh DOM) supaya mudah diuji.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RawThermalIntent = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* @body-start */
  "use strict";

  var MIME_PDF = "application/pdf";
  var ACTION_VIEW = "android.intent.action.VIEW";

  /**
   * Parameter khusus Chrome for Android: kalau tidak ada aplikasi yang bisa
   * menangani Intent (mis. Raw Thermal belum terpasang di tablet), Chrome
   * membuka URL ini alih-alih menampilkan "aplikasi tidak ditemukan".
   * Tanpa ini, kegagalan di tablet terjadi tanpa jejak apa pun di layar.
   */
  var BROWSER_FALLBACK_PARAM = "S.browser_fallback_url";

  function currentLocation() {
    return typeof window !== "undefined" ? window.location.href : undefined;
  }

  function toAbsoluteUrl(url, base) {
    if (typeof url !== "string" || url.trim() === "") {
      throw new Error("RawThermal: url wajib diisi dan berupa string.");
    }
    return new URL(url.trim(), base || currentLocation()).href;
  }

  /**
   * Susun daftar parameter Intent. `scheme` dan `package` wajib, sedangkan
   * fallback hanya ikut kalau pemanggil menyediakannya.
   */
  function buildIntentParams(parsedUrl, packageName, browserFallbackUrl) {
    var params = [
      "scheme=" + parsedUrl.protocol.replace(":", ""),
      "action=" + ACTION_VIEW,
      "type=" + MIME_PDF,
      "package=" + packageName
    ];

    if (browserFallbackUrl) {
      params.push(BROWSER_FALLBACK_PARAM + "=" + encodeURIComponent(browserFallbackUrl));
    }
    return params;
  }

  /**
   * Bangun string `intent://` untuk membuka PDF di package Raw Thermal.
   * Format mengikuti skema Android Intent URI (Chrome for Android).
   *
   * @param {string} url        URL PDF, boleh relatif.
   * @param {string} packageName Package aplikasi target.
   * @param {object} [ctx]      `{ base, browserFallbackUrl }`. `base` hanya
   *                            dipakai saat tidak ada window (Node/uji).
   */
  function buildViewIntent(url, packageName, ctx) {
    if (!packageName) {
      throw new Error("RawThermal: packageName wajib diisi.");
    }

    var context = ctx || {};
    var parsed = new URL(toAbsoluteUrl(url, context.base));
    var target =
      parsed.host + parsed.pathname + (parsed.search || "") + (parsed.hash || "");

    var params = buildIntentParams(parsed, packageName, context.browserFallbackUrl);

    return "intent://" + target + "#Intent;" + params.join(";") + ";end";
  }

  return {
    MIME_PDF: MIME_PDF,
    ACTION_VIEW: ACTION_VIEW,
    BROWSER_FALLBACK_PARAM: BROWSER_FALLBACK_PARAM,
    toAbsoluteUrl: toAbsoluteUrl,
    buildViewIntent: buildViewIntent
  };
  /* @body-end */
});
