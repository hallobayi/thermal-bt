#!/usr/bin/env node
/*!
 * build.js — jadikan src/*.js satu bundel browser di dist/.
 *
 * Kenapa hand-rolled: proyek ini nol dependensi dan dipakai lewat satu tag
 * <script> di aplikasi PHP/CI4. Modul src ditulis dalam pola UMD kecil —
 * di Node mereka memakai require(), di browser mereka mendaftarkan diri ke
 * objek global. Build ini membuang cabang require() lalu menggabungkan tiap
 * factory dalam IIFE, jadi nama seperti `DEFAULTS` tidak bocor ke global.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

// Urutan = urutan dependensi. `index.js` adalah satu-satunya modul yang punya
// argumen factory dan menjadi pemilik API publik `window.RawThermal`.
const MODULES = ["config.js", "platform.js", "intent.js", "text.js", "dom.js", "index.js"];

// Pembatas body factory. Ditulis sebagai komentar agar tidak mengganggu
// pembacaan modul sekaligus tidak mungkin muncul di kode biasa.
const BODY_START = "/* @body-start */";
const BODY_END = "/* @body-end */";
const ENTRY_SIGNATURE = "(config, platform, intent, text, dom)";
// Argumen harus dibaca dari `global`: modul-modul lain hanya mendaftarkan diri
// ke window (window.RawThermalConfig, dst.), jadi menulis `config, platform, ...`
// begitu saja berarti merujuk variabel yang tidak pernah ada.
const ENTRY_ARGS =
  "global.RawThermalConfig, global.RawThermalPlatform, global.RawThermalIntent, " +
  "global.RawThermalText, global.RawThermalDom";

const BANNER = `/*!
 * RawThermal JS v__VERSION__
 * Browser/PWA helper for Raw Thermal on Android.
 *
 * Raw Thermal does not expose the rawbt: browser URI used by RawBT, so this
 * library focuses on Android VIEW intent handoff for PDF URLs.
 *
 * Generated file - do not edit directly. Edit src/*.js and run: npm run build
 * License: MIT
 */`;

function fail(message) {
  throw new Error(message);
}

function readModule(fileName) {
  const fullPath = path.join(SRC, fileName);
  if (!fs.existsSync(fullPath)) fail(`Modul sumber tidak ditemukan: ${fullPath}`);
  return { fileName, source: fs.readFileSync(fullPath, "utf8") };
}

/** Nama global untuk sebuah modul: config.js -> RawThermalConfig. */
function globalName(fileName) {
  return "RawThermal" + fileName.replace(".js", "").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Ambil isi `factory` dari satu modul UMD.
 *
 * Body dipotong dari pembatas `@body-start` sampai tepat sebelum `@body-end`,
 * yang sengaja ditulis sebagai komentar di setiap modul.
 *
 * Dua pendekatan tekstual sudah dicoba dan keduanya gagal, jadi pembatas ini
 * bukan hiasan:
 *   1. `source.lastIndexOf("});")` salah karena `.forEach(function (k) { ... });`
 *      di dalam body juga berakhir `});`, sehingga modul terpotong di tengah,
 *      lalu sisa barisnya bocor menjadi kode liar di bundel.
 *   2. `indexOf("{", marker)` juga salah karena tanda `{` di dalam default
 *      parameter — `function f(a, b = {})` — ikut terhitung, sehingga body
 *      mulai dari posisi yang salah dan bundel gagal di-parse.
 */
function extractFactoryBody(source, fileName) {
  const start = source.indexOf(BODY_START);
  if (start === -1) fail(`${fileName}: pembatas "${BODY_START}" tidak ditemukan.`);

  const end = source.indexOf(BODY_END, start);
  if (end === -1) fail(`${fileName}: pembatas "${BODY_END}" tidak ditemukan.`);

  return dedent(source.slice(start + BODY_START.length, end)).trim();
}

/** Kurangi indentasi bersama dari potongan kode. */
function dedent(code) {
  const lines = code.split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.match(/^[ \t]*/)[0].length);
  const common = indents.length ? Math.min(...indents) : 0;

  return lines.map((line) => line.slice(common)).join("\n");
}

/** Buang komentar blok saja; kode sengaja tidak diubah agar tetap aman. */
function minify(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .join("\n")
    .replace(/\n{2,}/g, "\n");
}

function readVersion(modules) {
  const config = modules.find((m) => m.fileName === "config.js");
  const match = /VERSION\s*=\s*"([^"]+)"/.exec(config.source);
  if (!match) fail("config.js: VERSION tidak ditemukan.");
  return match[1];
}

/** Bundel browser: setiap factory dibungkus IIFE agar tidak ada kebocoran global. */
function buildBrowserBundle(modules, version) {
  const parts = modules.map(({ fileName, source }) => {
    const body = extractFactoryBody(source, fileName);
    const isEntry = fileName === "index.js";

    const indented = indent(body);
    // Setiap modul WAJIB menugaskan hasil factory-nya ke `global`, karena
    // entry point membacanya kembali lewat global.RawThermal*. Tanpa
    // penugasan, factory jalan lalu hasilnya dibuang, dan entry point meledak
    // dengan "Cannot read properties of undefined".
    //
    // Indentasi penutup juga penting: `})(...)` pada kolom 0 akan menutup
    // IIFE terluar, bukan factory di dalamnya.
    const wrapper = isEntry
      ? `  global.RawThermal = (function ${ENTRY_SIGNATURE} {${indented}\n  })(${ENTRY_ARGS});`
      : `  global.${globalName(fileName)} = (function () {${indented}\n  })();`;

    return (
      `/* --- src/${fileName} --- */\n` +
      `(function (global) {\n  "use strict";\n\n${wrapper}\n` +
      `})(typeof window !== "undefined" ? window : this);`
    );
  });

  return [BANNER.replace("__VERSION__", version), "", ...parts].join("\n\n");
}

function indent(code, spaces = 4) {
  const pad = " ".repeat(spaces);
  return (
    "\n" +
    code
      .split("\n")
      .map((line) => (line.trim() === "" ? "" : pad + line))
      .join("\n")
  );
}

/**
 * Bundel CommonJS untuk konsumen Node/bundler dan untuk menjalankan unit test.
 *
 * Strukturnya meniru bundel browser supaya logika yang diuji benar-benar sama:
 * setiap modul mengisi `global.RawThermal*`, lalu entry point membacanya lagi
 * dari `global`. Urutan deklarasi penting — semua helper harus selesai sebelum
 * entry dipanggil, kalau tidak entry membaca `undefined`.
 */
function buildCommonJs(modules) {
  const byName = Object.fromEntries(modules.map((m) => [m.fileName, m]));
  const config = extractFactoryBody(byName["config.js"].source, "config.js");

  const helperModules = MODULES.filter((f) => f !== "config.js" && f !== "index.js");

  const helpers = helperModules
    .map((fileName) => {
      const inner = extractFactoryBody(byName[fileName].source, fileName);
      const name = globalName(fileName);
      return `global.${name}.value = (function () {\n${indent(inner)}\n})();`;
    })
    .join("\n\n");

  const declarations = [
    `const RawThermalConfig = (function () {${indent(config)}\n})();`,
    "",
    "const global = { RawThermalConfig: RawThermalConfig };",
    ...helperModules.map((f) => `global.${globalName(f)} = { value: undefined };`),
    "",
    helpers,
    "",
    ...helperModules.map((f) => `global.${globalName(f)} = global.${globalName(f)}.value;`)
  ].join("\n");

  // Entry memakai `global.RawThermal*` persis seperti di browser, jadi
  // ENTRY_ARGS dipakai apa adanya — tanpa mencopot awalan `global.`.
  const entryBody = extractFactoryBody(byName["index.js"].source, "index.js");
  const entry = `module.exports = (function ${ENTRY_SIGNATURE} {\n${indent(entryBody)}\n})(${ENTRY_ARGS});`;

  return `"use strict";

${declarations}

${entry}

module.exports.version = RawThermalConfig.VERSION;
module.exports.DEFAULTS = RawThermalConfig.DEFAULTS;
module.exports._internals = {
  config: RawThermalConfig,
  platform: global.RawThermalPlatform,
  intent: global.RawThermalIntent,
  text: global.RawThermalText,
  dom: global.RawThermalDom
};
`;
}

function writeFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, "utf8");
  return fs.statSync(filePath).size;
}

function build() {
  const modules = MODULES.map(readModule);
  const version = readVersion(modules);

  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

  const bundle = buildBrowserBundle(modules, version) + "\n";
  const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

  const results = [
    ["dist/rawthermal.js", writeFile(path.join(DIST, "rawthermal.js"), bundle)],
    ["dist/rawthermal.min.js", writeFile(path.join(DIST, "rawthermal.min.js"), minify(bundle) + "\n")],
    ["dist/rawthermal.cjs", writeFile(path.join(DIST, "rawthermal.cjs"), buildCommonJs(modules))]
  ];

  console.log(`RawThermal JS v${version}`);
  results.forEach(([name, size]) => {
    console.log(`  ${name.padEnd(26)} ${size} bytes`);
  });
}

if (require.main === module) {
  try {
    build();
  } catch (err) {
    console.error(`Build gagal: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { build, MODULES, extractFactoryBody, minify, buildBrowserBundle, buildCommonJs };
