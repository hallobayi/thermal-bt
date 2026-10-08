/*!
 * RawThermal JS — lapisan DOM
 *
 * Semua sentuhan ke `window`/`document` terkumpul di sini supaya modul lain
 * tetap murni dan bisa diuji tanpa browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RawThermalDom = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* @body-start */
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
  /* @body-end */
});
