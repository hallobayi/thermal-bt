/**
 * Build a global bundle from the TypeScript source tree.
 *
 * The library is written as ESM with `.ts` extensions, which esbuild resolves natively. We
 * produce three artifacts:
 *
 *   dist/thermal-bt.global.js      IIFE, unminified, with source map
 *   dist/thermal-bt.global.min.js  IIFE, minified
 *   dist/thermal-bt.umd.js         UMD (works as <script>, AMD, or CommonJS)
 *
 * The UMD is produced by wrapping a CJS bundle in the classic UMD boilerplate. This is the
 * most reliable way to serve "traditional JavaScript" — a page that loads the library with a
 * plain `<script src>` tag and accesses it as `window.thermalBt`.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '').replace(/^\/([a-zA-Z]:)/, '$1')
const dist = resolve(root, 'dist')
const esbuild = resolve(root, 'node_modules/esbuild/bin/esbuild')

const entry = resolve(root, 'src/index.ts')
const globalName = 'thermalBt'

function run(args) {
  execFileSync(process.execPath, [esbuild, ...args], { stdio: 'inherit' })
}

// ---------------------------------------------------------------------------
// IIFE (global script)
// ---------------------------------------------------------------------------

run([
  entry,
  '--bundle',
  '--format=iife',
  `--global-name=${globalName}`,
  '--platform=browser',
  '--target=es2022',
  '--outfile=' + resolve(dist, 'thermal-bt.global.js'),
  '--sourcemap',
  '--banner:js=/* thermal-bt — https://github.com/mdestafadilah/thermal-bt */'
])

// ---------------------------------------------------------------------------
// IIFE minified
// ---------------------------------------------------------------------------

run([
  entry,
  '--bundle',
  '--format=iife',
  `--global-name=${globalName}`,
  '--platform=browser',
  '--target=es2022',
  '--outfile=' + resolve(dist, 'thermal-bt.global.min.js'),
  '--minify',
  '--banner:js=/* thermal-bt — https://github.com/mdestafadilah/thermal-bt */'
])

// ---------------------------------------------------------------------------
// UMD: CJS bundle + wrapper
// ---------------------------------------------------------------------------

const cjsPath = resolve(dist, '.tmp-umd-cjs.js')
run([
  entry,
  '--bundle',
  '--format=cjs',
  '--platform=browser',
  '--target=es2022',
  '--outfile=' + cjsPath,
  '--minify'
])

const cjsBody = readFileSync(cjsPath, 'utf-8')

// esbuild's CJS bundle ends with `module.exports = gu(Uu);`. In a UMD we need the factory to
// return the export object, so we replace that assignment with a return and strip the outer
// "use strict" because the UMD wrapper already provides one.
//
// CRITICAL: the replacement must move the `return` to the *end* of the bundle, not inline
// where `module.exports` originally sat, because the minified CJS has `var` declarations
// after the export assignment and a `return` in the middle dead-codes everything after it.
const wrappedBody = cjsBody
  .replace(/^"use strict";?/, '')
  .replace(/module\.exports\s*=\s*gu\(Uu\);?/, '')
  .trim() + '\nreturn gu(Uu);\n'

const umdBody =
  `(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.${globalName} = factory());
})(this, (function () { 'use strict';
${wrappedBody}
}));
`

writeFileSync(resolve(dist, 'thermal-bt.umd.js'), umdBody)

// ---------------------------------------------------------------------------
// Self-check: the UMD must expose a working API in a bare Node context.
// ---------------------------------------------------------------------------

const umd = readFileSync(resolve(dist, 'thermal-bt.umd.js'), 'utf-8')
const vm = new Function('module', 'exports', 'define', 'globalThis', umd)
const fakeModule = { exports: {} }
vm(fakeModule, fakeModule.exports, undefined, {})
const api = fakeModule.exports

if (typeof api.PrintDocument !== 'function') {
  throw new Error('UMD bundle did not expose PrintDocument')
}
if (typeof api.renderEscPos !== 'function') {
  throw new Error('UMD bundle did not expose renderEscPos')
}
if (typeof api.print !== 'function') {
  throw new Error('UMD bundle did not expose print')
}

// End-to-end byte check: build a tiny receipt and compare the bytes.
const job = new api.PrintDocument({ columns: 8 })
job.initialize().line('A').cut()
const { output } = api.renderEscPos(job)
const expected = new Uint8Array([
  0x1b, 0x40, // initialize
  0x41, 0x0a, // "A" + LF
  0x1d, 0x56, 0x41, 0x03 // cut
])
if (output.length !== expected.length || !output.every((b, i) => b === expected[i])) {
  throw new Error(
    `UMD round-trip bytes mismatch:\n  got      ${[...output].map((b) => b.toString(16).padStart(2, '0')).join(' ')}\n  expected ${[...expected].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`
  )
}

console.log('Global build OK: thermal-bt.global.js, thermal-bt.global.min.js, thermal-bt.umd.js')
