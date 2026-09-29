/**
 * Zero-dependency static file server for the examples.
 *
 * ES modules cannot be loaded over `file://` — the browser refuses the cross-origin request — so
 * the examples need a real origin even to render.
 *
 *   npm run examples                      # http://127.0.0.1:4173
 *   HOST=0.0.0.0 npm run examples         # reachable from a phone on the same network
 *
 * A phone is the only way to exercise the `intent:` hand-offs, so the `0.0.0.0` form is the one
 * that matters in practice. It exposes the project directory to the local network, which is fine
 * for a laptop on a trusted network and not something to leave running on a public one.
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const port = Number(process.env.PORT ?? 4173)
const host = process.env.HOST ?? '127.0.0.1'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}

const server = createServer(async (request, response) => {
  const requested = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`).pathname
  const relative = requested === '/' ? '/examples/index.html' : requested

  // Resolved and then checked against the root, so `..` in a URL cannot escape the project.
  const target = resolve(join(root, normalize(relative)))
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  try {
    const info = await stat(target)
    if (info.isDirectory()) {
      response.writeHead(404).end('Not found')
      return
    }

    const body = await readFile(target)
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    })
    response.end(body)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(
      `Not found: ${relative}\n\n` +
        `If this is /dist/index.js, run "npm run build" first — the examples import the built output.\n`
    )
  }
})

server.listen(port, host, () => {
  console.log(`Examples: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`)
  if (host === '0.0.0.0') {
    console.log('Bound to all interfaces so a phone on this network can reach it.')
  }
})
