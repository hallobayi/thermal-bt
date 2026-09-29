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

/** Window tiruan: cukup untuk menguji dom.js tanpa browser asli. */
function fakeWindow(options = {}) {
  const calls = { open: [], revoked: [], timers: [] };
  const win = {
    location: { href: BASE },
    navigator: { userAgent: options.userAgent || "Mozilla/5.0 (Windows NT 10.0)" },
    open(url, target, features) {
      calls.open.push({ url, target, features });
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
    },
    document: {
      createElement: () => ({
        style: {},
        set href(v) { this._href = v; },
        get href() { return this._href; },
        click() { calls.clicked = this._href; },
        parentNode: null
      }),
      body: {
        appendChild(node) { node.parentNode = this; calls.appended = node; },
        removeChild(node) { node.parentNode = null; }
      }
    }
  };
  return { win, calls };
}

test("config: default terisi saat opsi kosong", () => {
  const opts = config.withDefaults();
  assert.equal(opts.packageName, "com.rawthermal.app");
  assert.equal(opts.fallbackUrl, null);
  assert.equal(opts.openInNewTab, true);
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

test("platform: tanpa window tidak melempar", () => {
  assert.equal(platform.isAndroid(null), false);
});

test("intent: membentuk intent:// lengkap dengan query dan package", () => {
  const built = intent.buildViewIntent(
    "/kasir/generateNotaBayar?no_invoice=INV001",
    "com.rawthermal.app",
    BASE
  );
  assert.equal(
    built,
    "intent://kasir.example.com/kasir/generateNotaBayar?no_invoice=INV001" +
      "#Intent;scheme=https;action=android.intent.action.VIEW;" +
      "type=application/pdf;package=com.rawthermal.app;end"
  );
});

test("intent: mempertahankan hash dan skema http", () => {
  const built = intent.buildViewIntent("http://localhost:8080/nota.pdf#p=1", "com.x", BASE);
  assert.match(built, /^intent:\/\/localhost:8080\/nota\.pdf#p=1#Intent;scheme=http;/);
});

test("intent: url kosong ditolak dengan pesan jelas", () => {
  assert.throws(() => intent.buildViewIntent("", "com.x", BASE), /url wajib diisi/);
  assert.throws(() => intent.buildViewIntent(null, "com.x", BASE), /url wajib diisi/);
});

test("intent: packageName kosong ditolak", () => {
  assert.throws(() => intent.buildViewIntent("/a.pdf", "", BASE), /packageName/);
});

test("text: escape HTML mencegah injeksi lewat isi nota", () => {
  const html = text.buildTextDocument("<script>alert(1)</script> & co", "Nota");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; co/);
  assert.equal(html.includes("<script>"), false);
});

test("text: dokumen memakai pre-wrap agar kolom struk sejajar", () => {
  const html = text.buildTextDocument("Total   10.000");
  assert.match(html, /white-space:pre-wrap/);
});

test("dom: openUrl melaporkan popup-blocker, tidak menelan kegagalan", () => {
  const { win, calls } = fakeWindow({ openReturns: null });
  const result = dom.openUrl("https://x.test/a.pdf", { openInNewTab: true }, win);
  assert.equal(result.opened, false);
  assert.equal(calls.open[0].target, "_blank");
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
  assert.match(calls.clicked, /^intent:\/\//);
  assert.equal(calls.appended.parentNode, null, "anchor harus dilepas kembali");
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
