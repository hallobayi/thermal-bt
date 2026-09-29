/*!
 * RawThermal JS
 * Browser/PWA helper for Raw Thermal Android.
 *
 * Note:
 * Raw Thermal does not expose the same rawbt: browser URI used by RawBT.
 * This library therefore focuses on Android VIEW/SHARE intent handoff for
 * PDF URLs and provides a clean API that can be adapted later if Raw Thermal
 * adds a dedicated URI/Intent API.
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    packageName: "com.rawthermal.app",
    fallbackUrl: null,
    openInNewTab: true
  };

  function merge(a, b) {
    var out = {};
    Object.keys(a || {}).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b || {}).forEach(function (k) { out[k] = b[k]; });
    return out;
  }

  function isAndroid() {
    var ua = navigator.userAgent || "";
    var uaData = navigator.userAgentData;
    return /android/i.test(ua) ||
      (uaData && /android/i.test(uaData.platform || "")) ||
      (/\blinux\b/i.test(ua) &&
       "ontouchstart" in window &&
       !/windows|macintosh|cros/i.test(ua));
  }

  function absoluteUrl(url) {
    return new URL(url, window.location.href).href;
  }

  function buildViewIntent(url, packageName) {
    var u = absoluteUrl(url);
    var parsed = new URL(u);
    return "intent://" + parsed.host + parsed.pathname +
      (parsed.search || "") + (parsed.hash || "") +
      "#Intent;" +
      "scheme=" + parsed.protocol.replace(":", "") + ";" +
      "action=android.intent.action.VIEW;" +
      "type=application/pdf;" +
      "package=" + packageName + ";" +
      "end";
  }

  function launch(url, options) {
    options = merge(DEFAULTS, options || {});

    if (!isAndroid()) {
      if (options.fallbackUrl) {
        window.open(absoluteUrl(options.fallbackUrl), "_blank");
        return { ok: true, mode: "fallback" };
      }
      window.open(absoluteUrl(url), "_blank");
      return { ok: true, mode: "browser" };
    }

    var intent = buildViewIntent(url, options.packageName);
    var a = document.createElement("a");
    a.href = intent;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1000);

    return { ok: true, mode: "android-intent", intent: intent };
  }

  function printUrl(url, options) {
    return launch(url, options);
  }

  function print(options) {
    if (!options) throw new Error("RawThermal.print membutuhkan options.");
    if (typeof options === "string") return printUrl(options, {});
    if (options.url) return printUrl(options.url, options);
    if (options.pdfUrl) return printUrl(options.pdfUrl, options);
    throw new Error("Gunakan { url: '/path/nota.pdf' }.");
  }

  function printText(text, options) {
    // Browser cannot reliably send arbitrary ESC/POS bytes directly to Raw Thermal.
    // Create a minimal printable text document and open it as HTML.
    options = merge(DEFAULTS, options || {});
    var escaped = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    var html =
      "<!doctype html><html><head><meta charset='utf-8'>" +
      "<title>Raw Thermal</title>" +
      "<style>body{font-family:monospace;white-space:pre-wrap;margin:8mm;font-size:12px}</style>" +
      "</head><body>" + escaped + "</body></html>";

    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);

    if (!isAndroid()) {
      window.open(url, "_blank");
      return { ok: true, mode: "browser", objectUrl: url };
    }

    // Android VIEW Intent is PDF-oriented in the current Raw Thermal manifest.
    // Text therefore opens in the browser unless the caller supplies a PDF URL.
    window.open(url, "_blank");
    return {
      ok: true,
      mode: "browser-text",
      objectUrl: url,
      message: "Untuk Raw Thermal gunakan printUrl() dengan PDF."
    };
  }

  function printBase64(base64, options) {
    throw new Error(
      "Raw Thermal saat ini tidak menyediakan browser URI resmi untuk Base64 ESC/POS. " +
      "Gunakan printUrl() dengan PDF, atau buat native Android bridge."
    );
  }

  function getVersion() {
    return "1.0.0";
  }

  global.RawThermal = {
    version: getVersion(),
    isAndroid: isAndroid,
    print: print,
    printUrl: printUrl,
    printText: printText,
    printBase64: printBase64,
    buildViewIntent: function (url, options) {
      options = merge(DEFAULTS, options || {});
      return buildViewIntent(url, options.packageName);
    }
  };
})(window);
