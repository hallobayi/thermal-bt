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
  /* @body-end */
});
