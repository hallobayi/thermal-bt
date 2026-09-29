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

  function absoluteUrl(url, base) {
    var resolvedBase =
      base || (typeof window !== "undefined" ? window.location.href : undefined);
    return new URL(url, resolvedBase).href;
  }

  function toAbsoluteUrl(url, base) {
    if (typeof url !== "string" || url.trim() === "") {
      throw new Error("RawThermal: url wajib diisi dan berupa string.");
    }
    return absoluteUrl(url.trim(), base);
  }

  /**
   * Bangun string `intent://` untuk membuka PDF di package Raw Thermal.
   * Format mengikuti skema Android Intent URI (Chrome for Android).
   */
  function buildViewIntent(url, packageName, base) {
    if (!packageName) {
      throw new Error("RawThermal: packageName wajib diisi.");
    }

    var parsed = new URL(toAbsoluteUrl(url, base));

    return (
      "intent://" +
      parsed.host +
      parsed.pathname +
      (parsed.search || "") +
      (parsed.hash || "") +
      "#Intent;" +
      "scheme=" + parsed.protocol.replace(":", "") + ";" +
      "action=" + ACTION_VIEW + ";" +
      "type=" + MIME_PDF + ";" +
      "package=" + packageName + ";" +
      "end"
    );
  }

  return {
    MIME_PDF: MIME_PDF,
    ACTION_VIEW: ACTION_VIEW,
    toAbsoluteUrl: toAbsoluteUrl,
    buildViewIntent: buildViewIntent
  };
  /* @body-end */
});
