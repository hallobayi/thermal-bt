"use strict";

const RawThermalConfig = (function () {
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
})();

const global = { RawThermalConfig: RawThermalConfig };
global.RawThermalPlatform = { value: undefined };
global.RawThermalIntent = { value: undefined };
global.RawThermalText = { value: undefined };
global.RawThermalDom = { value: undefined };

global.RawThermalPlatform.value = (function () {

    "use strict";

    var ANDROID = /android/i;
    var LINUX = /\blinux\b/i;
    // OS desktop yang juga memakai kernel Linux; jangan sampai ikut tertangkap
    // oleh cabang "Linux + layar sentuh" di bawah.
    var NON_ANDROID_DESKTOP = /windows|macintosh|cros/i;

    function getWindow(win) {
      return win || (typeof window !== "undefined" ? window : null);
    }

    /**
     * Tablet Android sering mengirim UA desktop ("X11; Linux x86_64") ketika
     * "Situs desktop" diaktifkan, jadi kemampuan sentuh adalah satu-satunya
     * sinyal yang tersisa. `maxTouchPoints` dipakai lebih dulu karena tetap
     * tersedia di WebView yang tidak mengekspos `ontouchstart` di window.
     */
    function hasTouch(scope) {
      if (!scope) return false;
      if (scope.navigator && scope.navigator.maxTouchPoints > 0) return true;
      return "ontouchstart" in scope;
    }

    /**
     * Catatan penting untuk tablet: `navigator.userAgentData.mobile` bernilai
     * `false` di tablet Android. Jangan pernah memakainya untuk menolak
     * perangkat — tablet akan ikut tersingkir.
     */
    function isAndroid(win) {
      var scope = getWindow(win);
      if (!scope || !scope.navigator) return false;

      var ua = scope.navigator.userAgent || "";
      var uaData = scope.navigator.userAgentData;

      if (ANDROID.test(ua)) return true;
      if (uaData && ANDROID.test(uaData.platform || "")) return true;

      return LINUX.test(ua) && !NON_ANDROID_DESKTOP.test(ua) && hasTouch(scope);
    }

    return { isAndroid: isAndroid };
})();

global.RawThermalIntent.value = (function () {

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
})();

global.RawThermalText.value = (function () {

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
})();

global.RawThermalDom.value = (function () {

    "use strict";

    // Tab tujuan butuh waktu memuat blob sebelum object URL boleh dilepas.
    var OBJECT_URL_TTL_MS = 60000;

    // Duplikasi kecil dari platform.js, disengaja: setiap modul harus bisa
    // berdiri sendiri di bundel browser (factory tanpa dependensi).
    function getWindow(win) {
      return win || (typeof window !== "undefined" ? window : null);
    }

    /** Putus `window.opener` tanpa membuat referensi tab jadi hilang. */
    function detachOpener(ref) {
      try {
        if (ref && typeof ref === "object") ref.opener = null;
      } catch (err) {
        /* lintas-origin: bukan masalah, noopener tetap diusahakan lewat rel */
      }
    }

    /**
     * Klik anchor sementara, lalu bersihkan.
     *
     * Dipakai untuk dua hal yang tidak andal lewat `window.open`:
     * `intent://` di Android, dan tab baru yang popup blocker-nya menolak
     * (umum di WebView/PWA Android).
     *
     * Anchor diletakkan di luar layar, bukan `display:none`, karena WebView
     * Android lama tidak menjalankan klik pada elemen yang tidak dirender.
     */
    function clickAnchor(scopeWin, url, target) {
      var doc = scopeWin.document;
      var host = doc && (doc.body || doc.documentElement);
      if (!doc || typeof doc.createElement !== "function" || !host) return false;

      var anchor = doc.createElement("a");
      anchor.href = url;
      anchor.target = target;
      anchor.rel = "noopener";
      anchor.style.position = "fixed";
      anchor.style.left = "-9999px";
      anchor.style.top = "0";

      host.appendChild(anchor);
      try {
        anchor.click();
        return true;
      } catch (err) {
        return false;
      } finally {
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
      }
    }

    /**
     * `window.open` TANPA string features.
     *
     * Jangan pernah menambahkan "noopener" sebagai features: browser
     * mengembalikan `null` ketika noopener dipakai, sehingga tab yang berhasil
     * terbuka terbaca sebagai kegagalan. Opener diputus manual setelahnya.
     */
    function tryWindowOpen(scopeWin, url, target) {
      try {
        var ref = scopeWin.open(url, target);
        detachOpener(ref);
        return ref;
      } catch (err) {
        return null;
      }
    }

    /**
     * Buka URL. Mengembalikan status terbuka/tidak, bukan menelan kegagalan
     * popup-blocker diam-diam seperti versi sebelumnya.
     */
    function openUrl(url, options, win) {
      var scopeWin = getWindow(win);
      if (!scopeWin) {
        return { opened: false, reason: "no-window" };
      }

      var target = options && options.openInNewTab === false ? "_self" : "_blank";
      if (tryWindowOpen(scopeWin, url, target)) {
        return { opened: true, target: target, via: "window" };
      }

      // window.open("_self") yang mengembalikan null tetap berarti navigasi
      // berjalan di tab yang sama.
      if (target === "_self") {
        return { opened: true, target: target, via: "window" };
      }

      if (clickAnchor(scopeWin, url, target)) {
        return { opened: true, target: target, via: "anchor" };
      }

      return { opened: false, reason: "blocked", target: target };
    }

    /**
     * Android tidak bisa membuka `intent://` lewat window.open dengan andal,
     * jadi dipakai <a> sementara yang diklik programatik lalu dibersihkan.
     */
    function clickIntent(intentUri, win) {
      var scopeWin = getWindow(win);
      if (!scopeWin) return false;
      return clickAnchor(scopeWin, intentUri, "_blank");
    }

    /** Buat object URL untuk dokumen HTML, lalu (opsional) lepaskan lagi. */
    function openTextDocument(html, options, win) {
      var scopeWin = getWindow(win);
      if (!scopeWin) {
        return { opened: false, reason: "no-window" };
      }
      if (!scopeWin.URL || !scopeWin.Blob) {
        return { opened: false, reason: "no-blob-support" };
      }

      var blob = new scopeWin.Blob([html], { type: "text/html;charset=utf-8" });
      var objectUrl = scopeWin.URL.createObjectURL(blob);
      var result = openUrl(objectUrl, options, scopeWin);

      // Dokumen sudah dipegang tab tujuan; membiarkan objectUrl hidup berarti
      // blob tidak pernah dibebaskan (kebocoran pada versi sebelumnya).
      if (!options || options.revokeObjectUrl !== false) {
        var delay = result.opened ? OBJECT_URL_TTL_MS : 0;
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
