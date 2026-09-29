#!/usr/bin/env node
/*!
 * test/bundle.test.js — uji bundel dist/ di dalam window tiruan.
 *
 * Tujuannya bukan mengulang uji unit, melainkan membuktikan bundel hasil build
 * benar-benar jalan: tidak ada nama yang bocor, urutan modul benar, dan API
 * publik tersedia persis seperti yang dipakai tombol lama di aplikasi CI4.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DIST = path.join(__dirname, "..", "dist");
const BUNDLE = path.join(DIST, "rawthermal.js");

function fakeBrowser(userAgent) {
  const calls = { open: [], clicked: [], revoked: [] };
  const win = {
    location: { href: "https://kasir.example.com/app/index.html" },
    navigator: { userAgent: userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64)" },
    // `URL` moet een echte constructor blijven: de library doet `new URL(...)`
    // om relatieve paden te resolven. Een kaal object hier laat alles klappen
    // met "URL is not a constructor".
    URL: Object.assign(URL, {
      createObjectURL: () => "blob:https://kasir.example.com/xyz",
      revokeObjectURL: (url) => calls.revoked.push(url)
    }),
    Blob: class Blob {
      constructor(parts, opts) {
        this.parts = parts;
        this.type = opts && opts.type;
      }
    },
    setTimeout(fn) { fn(); },
    open(url, target) {
      calls.open.push({ url, target });
      return {};
    },
    document: {
      createElement: () => ({
        style: {},
        set href(v) { this._href = v; },
        get href() { return this._href; },
        click() { calls.clicked.push(this._href); },
        parentNode: null
      }),
      body: {
        appendChild(node) { node.parentNode = this; },
        removeChild(node) { node.parentNode = null; }
      }
    }
  };
  win.window = win;
  return { win, calls };
}

/**
 * Laad dist/rawthermal.js in een schone window-context.
 *
 * Belangrijk: `vm.createContext(win)` deelt het host-object NIET terug. Alles
 * wat het script op `window` zet, moet via `vm.runInContext` uit de context
 * worden gelezen — anders zie je alleen `undefined` en lijk je een bug te
 * hebben die er niet is.
 */
function loadBundle(userAgent) {
  const source = fs.readFileSync(BUNDLE, "utf8");
  const { win, calls } = fakeBrowser(userAgent);
  const context = vm.createContext(win);

  vm.runInContext(source, context, { filename: "rawthermal.js" });

  const read = (expr) => vm.runInContext(expr, context);
  const RawThermal = read("RawThermal");

  return { RawThermal, win, calls, read };
}

test("bundel: dist/rawthermal.js ada dan API publik lengkap", () => {
  assert.equal(fs.existsSync(BUNDLE), true, "jalankan npm run build dulu");
  const { RawThermal } = loadBundle();

  ["isAndroid", "print", "printUrl", "printText", "printBase64", "buildViewIntent"].forEach(
    (name) => {
      assert.equal(typeof RawThermal[name], "function", `RawThermal.${name} hilang`);
    }
  );
  assert.equal(typeof RawThermal.version, "string");
});

test("bundel: tidak membocorkan nama internal ke window", () => {
  const { win } = loadBundle();
  ["DEFAULTS", "withDefaults", "buildViewIntent", "escapeHtml"].forEach((name) => {
    assert.equal(name in win, false, `${name} bocor menjadi global`);
  });
});

test("bundel: Android memicu intent VIEW ke package Raw Thermal", () => {
  const { RawThermal, calls } = loadBundle(
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"
  );
  const result = RawThermal.printUrl("/kasir/generateNotaBayar?no_invoice=INV001");

  assert.equal(result.ok, true);
  assert.equal(result.mode, "android-intent");
  assert.match(result.intent, /^intent:\/\/kasir\.example\.com\/kasir\/generateNotaBayar\?no_invoice=INV001#Intent;/);
  assert.match(result.intent, /package=com\.rawthermal\.app;end$/);
  assert.equal(calls.clicked.length, 1, "anchor intent harus diklik sekali");
});

test("bundel: non-Android membuka PDF di tab baru", () => {
  const { RawThermal, calls } = loadBundle("Mozilla/5.0 (Windows NT 10.0; Win64)");
  const result = RawThermal.printUrl("/kasir/nota.pdf");

  assert.equal(result.mode, "browser");
  assert.equal(calls.open[0].target, "_blank");
  assert.equal(calls.open[0].url, "https://kasir.example.com/kasir/nota.pdf");
});

test("bundel: fallbackUrl dipakai saat bukan Android", () => {
  const { RawThermal, calls } = loadBundle("Mozilla/5.0 (Windows NT 10.0; Win64)");
  const result = RawThermal.printUrl("/kasir/nota.pdf", { fallbackUrl: "/cetak/fallback" });

  assert.equal(result.mode, "fallback");
  assert.equal(calls.open[0].url, "https://kasir.example.com/cetak/fallback");
});

test("bundel: print() menerima string, { url }, dan { pdfUrl }", () => {
  const { RawThermal, calls } = loadBundle("Mozilla/5.0 (Windows NT 10.0; Win64)");

  assert.equal(RawThermal.print("/kasir/a.pdf").mode, "browser");
  assert.equal(RawThermal.print({ url: "/kasir/b.pdf" }).mode, "browser");
  assert.equal(RawThermal.print({ pdfUrl: "/kasir/c.pdf" }).mode, "browser");
  assert.equal(calls.open.length, 3);
  assert.equal(calls.open[1].url, "https://kasir.example.com/kasir/b.pdf");
});

test("bundel: print() tanpa url melempar pesan Indonesia", () => {
  const { RawThermal } = loadBundle();
  assert.throws(() => RawThermal.print({}), /Gunakan \{ url:/);
  assert.throws(() => RawThermal.print(), /membutuhkan options/);
});

test("bundel: printBase64 melempar, tidak gagal senyap", () => {
  const { RawThermal } = loadBundle();
  assert.throws(() => RawThermal.printBase64("AAAA"), /Base64 ESC\/POS/);
});

test("bundel: buildViewIntent berguna untuk debugging tanpa memicu Intent", () => {
  const { RawThermal, calls } = loadBundle(
    "Mozilla/5.0 (Linux; Android 14; Pixel 8)"
  );
  const built = RawThermal.buildViewIntent("/kasir/nota.pdf", { packageName: "com.custom.app" });

  assert.match(built, /package=com\.custom\.app;end$/);
  assert.equal(calls.clicked.length, 0, "tidak boleh ada Intent yang dipicu");
});

test("bundel: printText membuka dokumen dan melepas object URL", () => {
  const { RawThermal, calls } = loadBundle("Mozilla/5.0 (Windows NT 10.0; Win64)");
  const result = RawThermal.printText("Total  10.000", { openInNewTab: true });

  assert.equal(result.mode, "browser");
  assert.equal(result.objectUrl, "blob:https://kasir.example.com/xyz");
  assert.deepEqual(calls.revoked, ["blob:https://kasir.example.com/xyz"]);
});

test("bundel: dist/rawthermal.min.js juga bisa dimuat", () => {
  const minPath = path.join(DIST, "rawthermal.min.js");
  assert.equal(fs.existsSync(minPath), true);

  const source = fs.readFileSync(minPath, "utf8");
  const { win } = fakeBrowser("Mozilla/5.0 (Windows NT 10.0; Win64)");
  vm.runInContext(source, vm.createContext(win), { filename: "rawthermal.min.js" });

  assert.equal(typeof win.RawThermal.printUrl, "function");
  assert.equal(win.RawThermal.printUrl("/kasir/nota.pdf").mode, "browser");
});

test("bundel: dist/rawthermal.cjs bisa di-require Node", () => {
  const cjsPath = path.join(DIST, "rawthermal.cjs");
  assert.equal(fs.existsSync(cjsPath), true);

  const RawThermal = require(cjsPath);
  assert.equal(typeof RawThermal.isAndroid, "function");
  assert.equal(RawThermal.version, "1.1.0");

  // Di Node tidak ada window.location, jadi base harus diberikan eksplisit.
  // URL relatif memang tidak bisa diresolusi di luar browser — itu perilaku
  // yang benar, bukan bug.
  const built = RawThermal.buildViewIntent(
    "https://kasir.example.com/kasir/nota.pdf"
  );
  assert.match(built, /^intent:\/\/kasir\.example\.com\/kasir\/nota\.pdf#Intent;/);
  assert.match(built, /package=com\.rawthermal\.app;end$/);
});
