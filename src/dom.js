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
  /* @body-end */
});
