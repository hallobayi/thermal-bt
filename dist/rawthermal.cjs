"use strict";

const RawThermalConfig = (function () {
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
})();

const global = { RawThermalConfig: RawThermalConfig };
global.RawThermalPlatform = { value: undefined };
global.RawThermalIntent = { value: undefined };
global.RawThermalText = { value: undefined };
global.RawThermalDom = { value: undefined };

global.RawThermalPlatform.value = (function () {

    "use strict";

    function isAndroid(win) {
      var scope = win || (typeof window !== "undefined" ? window : null);
      if (!scope || !scope.navigator) return false;

      var ua = scope.navigator.userAgent || "";
      var uaData = scope.navigator.userAgentData;

      if (/android/i.test(ua)) return true;
      if (uaData && /android/i.test(uaData.platform || "")) return true;

      return (
        /\blinux\b/i.test(ua) &&
        "ontouchstart" in scope &&
        !/windows|macintosh|cros/i.test(ua)
      );
    }

    return { isAndroid: isAndroid };
})();

global.RawThermalIntent.value = (function () {

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
})();

global.RawThermalText.value = (function () {

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
})();

global.RawThermalDom.value = (function () {

    "use strict";

    function scope(win) {
      return win || (typeof window !== "undefined" ? window : null);
    }

    /**
     * Buka URL. Mengembalikan status terbuka/tidak, bukan menelan kegagalan
     * popup-blocker diam-diam seperti versi sebelumnya.
     */
    function openUrl(url, options, win) {
      var scopeWin = scope(win);
      if (!scopeWin) {
        return { opened: false, reason: "no-window" };
      }

      var target = options && options.openInNewTab === false ? "_self" : "_blank";
      var features = target === "_blank" ? "noopener" : undefined;

      try {
        var ref = scopeWin.open(url, target, features);
        return { opened: !!ref || target === "_self", target: target };
      } catch (err) {
        return { opened: false, reason: "blocked", error: err };
      }
    }

    /**
     * Android tidak bisa membuka `intent://` lewat window.open dengan andal,
     * jadi dipakai <a> sementara yang diklik programatik lalu dibersihkan.
     */
    function clickIntent(intent, win) {
      var scopeWin = scope(win);
      if (!scopeWin || !scopeWin.document) return false;

      var doc = scopeWin.document;
      var anchor = doc.createElement("a");
      anchor.href = intent;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.style.display = "none";

      doc.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
      }
      return true;
    }

    /** Buat object URL untuk dokumen HTML, lalu (opsional) lepaskan lagi. */
    function openTextDocument(html, options, win) {
      var scopeWin = scope(win);
      if (!scopeWin) {
        return { opened: false, reason: "no-window" };
      }

      var blob = new scopeWin.Blob([html], { type: "text/html;charset=utf-8" });
      var objectUrl = scopeWin.URL.createObjectURL(blob);
      var result = openUrl(objectUrl, options, scopeWin);

      // Dokumen sudah dipegang tab tujuan; membiarkan objectUrl hidup berarti
      // blob tidak pernah dibebaskan (kebocoran pada versi sebelumnya).
      if (options && options.revokeObjectUrl !== false) {
        var delay = result.opened ? 60000 : 0;
        scopeWin.setTimeout(function () {
          scopeWin.URL.revokeObjectURL(objectUrl);
        }, delay);
      }

      return {
        opened: result.opened,
        reason: result.reason,
        objectUrl: objectUrl
      };
    }

    return {
      openUrl: openUrl,
      clickIntent: clickIntent,
      openTextDocument: openTextDocument
    };
})();

global.RawThermalPlatform = global.RawThermalPlatform.value;
global.RawThermalIntent = global.RawThermalIntent.value;
global.RawThermalText = global.RawThermalText.value;
global.RawThermalDom = global.RawThermalDom.value;

module.exports = (function (config, platform, intent, text, dom) {

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
})(global.RawThermalConfig, global.RawThermalPlatform, global.RawThermalIntent, global.RawThermalText, global.RawThermalDom);

module.exports.version = RawThermalConfig.VERSION;
module.exports.DEFAULTS = RawThermalConfig.DEFAULTS;
module.exports._internals = {
  config: RawThermalConfig,
  platform: global.RawThermalPlatform,
  intent: global.RawThermalIntent,
  text: global.RawThermalText,
  dom: global.RawThermalDom
};
