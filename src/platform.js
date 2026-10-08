/*!
 * RawThermal JS — deteksi platform
 *
 * Deteksi disengaja longgar: selain pola "Android" pada User-Agent, beberapa
 * WebView/desktop-mode melaporkan Linux. Pola itu diterima selama perangkat
 * memang layar sentuh dan bukan Windows/macOS/ChromeOS.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RawThermalPlatform = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /* @body-start */
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
  /* @body-end */
});
