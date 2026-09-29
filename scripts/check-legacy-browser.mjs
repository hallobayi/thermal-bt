import { readFileSync } from 'node:fs'
import { launchEdge, tmpProfile } from 'file:///C:/Users/asus/.workbuddy-ai/skills/windows-edge-cdp-ui-verify/scripts/cdp.mjs'

const BASE = 'http://127.0.0.1:4173'
const SHOTS = 'D:/REACT-DEV/thermal-bt/.workbuddy-ai/tmp'

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const results = []
function check(label, condition, detail = '') {
  results.push({ label, ok: Boolean(condition), detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

const page = await launchEdge({ port: 9336, profileDir: tmpProfile('thermal-bt-legacy') })

try {
  await page.send('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA })
  await page.goto('/examples/legacy.html', { baseUrl: BASE })

  // Wait for the page to actually load — the preview text proves the script executed.
  await page.waitFor(
    'document.body && document.getElementById("preview") && document.getElementById("preview").textContent.includes("KOPI SENJA")',
    'legacy page renders'
  )

  const preview = await page.evaluate('document.getElementById("preview").textContent')
  check('legacy preview shows header', preview.includes('KOPI SENJA'), preview.slice(0, 40))
  check('legacy preview shows total', preview.includes('TOTAL'), preview.slice(0, 40))

  const hex = await page.evaluate('document.getElementById("hex").textContent')
  check('legacy hex starts with ESC @', hex.startsWith('1b 40'), hex.slice(0, 20))

  const src = await page.evaluate('document.getElementById("src").textContent')
  check('legacy loads global bundle', src.includes('thermal-bt.global'), src)

  const outcomeBefore = await page.evaluate('document.getElementById("outcome").innerHTML')
  check('legacy outcome starts empty', outcomeBefore.trim() === '', outcomeBefore.slice(0, 40))

  await page.clickByText('Print (rawthermal-share)')
  await page.waitFor(
    'document.getElementById("outcome").textContent.includes("Sent")',
    'outcome appears'
  )

  const outcome = await page.evaluate('document.getElementById("outcome").textContent')
  check('legacy print outcome says sent', outcome.includes('Sent:'), outcome.slice(0, 60))

  await page.screenshot(`${SHOTS}/legacy.png`)

  console.log('\nerrors:', JSON.stringify(page.errors))
  check('legacy console is clean', page.errors.length === 0, JSON.stringify(page.errors).slice(0, 300))
} finally {
  await page.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) {
  console.log('FAILED:', failed.map((r) => r.label).join(' | '))
  process.exit(1)
}
