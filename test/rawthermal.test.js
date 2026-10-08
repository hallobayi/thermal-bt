#!/usr/bin/env node
/*!
 * test/rawthermal.test.js — uji regresi untuk RawThermal JS.
 *
 * Dijalankan dengan runner bawaan Node (node:test), jadi tidak ada dependensi
 * tambahan. Yang diuji di sini adalah logika murni (intent, opsi, escape HTML)
 * plus perilaku DOM dengan window tiruan.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");

const config = require(path.join(SRC, "config.js"));
const platform = require(path.join(SRC, "platform.js"));
const intent = require(path.join(SRC, "intent.js"));
const text = require(path.join(SRC, "text.js"));
const dom = require(path.join(SRC, "dom.js"));

const BASE = "https://kasir.example.com/app/index.html";

/**
 * Window tiruan: cukup untuk menguji dom.js tanpa browser asli.
 *
 * `open` sengaja meniru perilaku browser: kalau ada string features (mis.
 * "noopener") hasilnya `null`. Itu yang membuat versi lama salah membaca
 * tab yang berhasil terbuka sebagai kegagalan.
 */
function fakeWindow(options = {}) {
  const calls = { open: [], revoked: [], timers: [], clicked: [] };

  const makeNode = () => ({
    style: {},
    set href(v) { this._href = v; },
    get href() { return this._href; },
    click() { calls.clicked.push(this._href); },
    parentNode: null
  });

  const makeHost = () => ({
    appendChild(node) { node.parentNode = this; calls.appended = node; },
    removeChild(node) { node.parentNode = null; }
  });

  const win = {
    location: { href: BASE },
    navigator: {
      userAgent: options.userAgent || "Mozilla/5.0 (Windows NT 10.0)",
      maxTouchPoints: options.maxTouchPoints || 0
    },
    open(url, target, features) {
      calls.open.push({ url, target, features });
      if (features) return null;
      return options.openReturns === null ? null : {};
    },
    URL: {
      createObjectURL: () => "blob:https://kasir.example.com/abc",
      revokeObjectURL: (url) => calls.revoked.push(url)
    },
    Blob: class Blob {
      constructor(parts, opts) {
        this.parts = parts;
        this.type = opts && opts.type;
      }
    },
    setTimeout(fn, delay) {
      calls.timers.push({ delay });
      fn();
    }
  };

  if (options.touchEvents) win.ontouchstart = null;
  if (options.maxTouchPoints) win.maxTouchPoints = options.maxTouchPoints;

  if (!options.noDocument) {
    win.document = {
      createElement: makeNode,
      body: makeHost(),
      documentElement: makeHost()
    };
    // Sebagian WebView hanya punya documentElement (skrip jalan di <head>).
    if (options.bodyless) delete win.document.body;
  }

  return { win, calls };
}

// --- config -----------------------------------------------------------------

test("config: default terisi saat opsi kosong", () => {
  const opts = config.withDefaults();
  assert.equal(opts.packageName, "com.rawthermal.app");
  assert.equal(opts.fallbackUrl, null);
  assert.equal(opts.openInNewTab, true);
  assert.equal(opts.autoPrint, true);
});

test("config: MODES dipakai sebagai satu-satunya sumber string mode", () => {
  assert.deepEqual(Object.values(config.MODES).sort(), [
    "android-intent",
    "browser",
    "browser-text",
    "fallback"
  ]);
});

test("config: opsi asing tidak ikut terbawa", () => {
  // Ini yang bikin opsi dari print() dulu bocor ke request.
  const opts = config.withDefaults({ url: "/a.pdf", pdfUrl: "/b.pdf" });
  assert.equal(Object.prototype.hasOwnProperty.call(opts, "url"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(opts, "pdfUrl"), false);
});

test("config: packageName kosong ditolak, bukan menghasilkan intent rusak", () => {
  assert.throws(() => config.withDefaults({ packageName: "   " }), /packageName/);
  assert.throws(() => config.withDefaults({ packageName: "" }), /packageName/);
});

test("config: packageName di-trim", () => {
  assert.equal(config.withDefaults({ packageName: "  com.x  " }).packageName, "com.x");
});

test("config: withDefaults tidak memutasi opsi pemanggil", () => {
  const input = { packageName: "com.x" };
  config.withDefaults(input);
  assert.deepEqual(input, { packageName: "com.x" });
});

// --- platform ---------------------------------------------------------------

test("platform: mendeteksi Android dari User-Agent", () => {
  const { win } = fakeWindow({
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"
  });
  assert.equal(platform.isAndroid(win), true);
});

test("platform: desktop bukan Android", () => {
  const { win } = fakeWindow({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64)" });
  assert.equal(platform.isAndroid(win), false);
});

test("platform: userAgentData.platform Android dikenali", () => {
  const { win } = fakeWindow({ userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
  win.navigator.userAgentData = { platform: "Android" };
  assert.equal(platform.isAndroid(win), true);
});

test("platform: tablet Android mode 'situs desktop' tetap dikenali", () => {
  // UA desktop Android tidak menyebut "Android" sama sekali; sisa sinyalnya
  // hanya Linux + layar sentuh. Ini kasus yang paling sering bikin cetak
  // gagal di tablet.
  const { win } = fakeWindow({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    maxTouchPoints: 5
  });
  assert.equal(platform.isAndroid(win), true);
});

test("platform: tablet Android lama tanpa maxTouchPoints tetap dikenali", () => {
  const { win } = fakeWindow({
    userAgent: "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36",
    touchEvents: true
  });
  assert.equal(platform.isAndroid(win), true);
});

test("platform: Linux desktop tanpa layar sentuh bukan Android", () => {
  const { win } = fakeWindow({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/121" });
  assert.equal(platform.isAndroid(win), false);
});

test("platform: laptop Windows layar sentuh bukan Android", () => {
  const { win } = fakeWindow({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    maxTouchPoints: 10
  });
  assert.equal(platform.isAndroid(win), false);
});

test("platform: tanpa window tidak melempar", () => {
  assert.equal(platform.isAndroid(null), false);
});

// --- intent -----------------------------------------------------------------

test("intent: membentuk intent:// lengkap dengan query dan package", () => {
  const built = intent.buildViewIntent(
    "/kasir/generateNotaBayar?no_invoice=INV001",
    "com.rawthermal.app",
    { base: BASE }
  );
  assert.equal(
    built,
    "intent://kasir.example.com/kasir/generateNotaBayar?no_invoice=INV001" +
      "#Intent;scheme=https;action=android.intent.action.VIEW;" +
      "type=application/pdf;package=com.rawthermal.app;end"
  );
});

test("intent: mempertahankan hash dan skema http", () => {
  const built = intent.buildViewIntent("http://localhost:8080/nota.pdf#p=1", "com.x", {
    base: BASE
  });
  assert.match(built, /^intent:\/\/localhost:8080\/nota\.pdf#p=1#Intent;scheme=http;/);
});

test("intent: browser fallback dipasang ter-encode supaya tablet tanpa aplikasi tetap dapat PDF", () => {
  const built = intent.buildViewIntent("/kasir/nota.pdf", "com.rawthermal.app", {
    base: BASE,
    browserFallbackUrl: "https://kasir.example.com/kasir/nota.pdf"
  });
  assert.match(
    built,
    /;S\.browser_fallback_url=https%3A%2F%2Fkasir\.example\.com%2Fkasir%2Fnota\.pdf;end$/
  );
});

test("intent: tanpa browserFallbackUrl, parameter fallback tidak ikut", () => {
  const built = intent.buildViewIntent("/kasir/nota.pdf", "com.rawthermal.app", { base: BASE });
  assert.equal(built.includes("S.browser_fallback_url"), false);
});

test("intent: url kosong ditolak dengan pesan jelas", () => {
  assert.throws(() => intent.buildViewIntent("", "com.x", { base: BASE }), /url wajib diisi/);
  assert.throws(() => intent.buildViewIntent(null, "com.x", { base: BASE }), /url wajib diisi/);
});

test("intent: packageName kosong ditolak", () => {
  assert.throws(() => intent.buildViewIntent("/a.pdf", "", { base: BASE }), /packageName/);
});

// --- text -------------------------------------------------------------------

test("text: escape HTML mencegah injeksi lewat isi nota", () => {
  const html = text.buildTextDocument("<script>alert(1)</script> & co", "Nota");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; co/);
  assert.equal(html.includes("<script>alert"), false);
});

test("text: dokumen memakai pre-wrap agar kolom struk sejajar", () => {
  const html = text.buildTextDocument("Total   10.000");
  assert.match(html, /white-space:pre-wrap/);
});

test("text: dokumen membawa viewport supaya tidak diperkecil di tablet", () => {
  const html = text.buildTextDocument("Total   10.000");
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /text-size-adjust:100%/);
});

test("text: dokumen menyiapkan ukuran kertas 58mm untuk dialog cetak Android", () => {
  const html = text.buildTextDocument("Total   10.000");
  assert.match(html, /@page\{size:58mm auto;margin:4mm\}/);
});

test("text: autoPrint aktif secara default, bisa dimatikan", () => {
  assert.match(text.buildTextDocument("x"), /window\.print\(\)/);
  assert.equal(text.buildTextDocument("x", "Nota", { autoPrint: false }).includes("<script>"), false);
});

// --- dom --------------------------------------------------------------------

test("dom: openUrl melaporkan kegagalan kalau diblokir dan tidak ada document", () => {
  const { win, calls } = fakeWindow({ openReturns: null, noDocument: true });
  const result = dom.openUrl("https://x.test/a.pdf", { openInNewTab: true }, win);
  assert.equal(result.opened, false);
  assert.equal(result.reason, "blocked");
  assert.equal(calls.open[0].target, "_blank");
});

test("dom: popup yang diblokir dicoba lagi lewat anchor, bukan langsung menyerah", () => {
  const { win, calls } = fakeWindow({ openReturns: null });
  const result = dom.openUrl("https://x.test/a.pdf", { openInNewTab: true }, win);

  assert.equal(result.opened, true);
  assert.equal(result.via, "anchor");
  assert.deepEqual(calls.clicked, ["https://x.test/a.pdf"]);
});

test("dom: window.open dipanggil tanpa features 'noopener'", () => {
  // Dengan features "noopener", browser mengembalikan null walau tab berhasil
  // dibuka — versi lama melaporkan ok:false untuk keberhasilan.
  const { win, calls } = fakeWindow();
  const result = dom.openUrl("https://x.test/a.pdf", { openInNewTab: true }, win);

  assert.equal(result.opened, true);
  assert.equal(result.via, "window");
  assert.equal(calls.open[0].features, undefined);
});

test("dom: openInNewTab=false memakai tab yang sama", () => {
  const { win, calls } = fakeWindow();
  dom.openUrl("https://x.test/a.pdf", { openInNewTab: false }, win);
  assert.equal(calls.open[0].target, "_self");
});

test("dom: clickIntent mengklik anchor intent lalu membuangnya dari DOM", () => {
  const { win, calls } = fakeWindow();
  const ok = dom.clickIntent("intent://kasir.example.com/a.pdf#Intent;end", win);
  assert.equal(ok, true);
  assert.match(calls.clicked[0], /^intent:\/\//);
  assert.equal(calls.appended.parentNode, null, "anchor harus dilepas kembali");
});

test("dom: anchor intent diletakkan di luar layar, bukan display:none", () => {
  // WebView Android lama tidak menjalankan klik pada elemen display:none.
  const { win, calls } = fakeWindow();
  dom.clickIntent("intent://kasir.example.com/a.pdf#Intent;end", win);
  assert.equal(calls.appended.style.display, undefined);
  assert.equal(calls.appended.style.position, "fixed");
  assert.equal(calls.appended.style.left, "-9999px");
});

test("dom: clickIntent tetap jalan kalau document.body belum ada", () => {
  const { win, calls } = fakeWindow({ bodyless: true });
  assert.equal(dom.clickIntent("intent://kasir.example.com/a.pdf#Intent;end", win), true);
  assert.match(calls.clicked[0], /^intent:\/\//);
});

test("dom: openTextDocument melepas object URL (perbaikan kebocoran)", () => {
  const { win, calls } = fakeWindow();
  const result = dom.openTextDocument("<html></html>", { revokeObjectUrl: true }, win);
  assert.equal(result.objectUrl, "blob:https://kasir.example.com/abc");
  assert.deepEqual(calls.revoked, ["blob:https://kasir.example.com/abc"]);
});

test("dom: revokeObjectUrl=false menahan object URL tetap hidup", () => {
  const { win, calls } = fakeWindow();
  dom.openTextDocument("<html></html>", { revokeObjectUrl: false }, win);
  assert.deepEqual(calls.revoked, []);
});
