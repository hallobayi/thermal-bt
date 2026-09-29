/**
 * Everything that touches the browser or the device.
 *
 * Isolated in one file so the rest of the library — the ESC/POS layer, the document model, the
 * renderers, the URI builder — stays pure and testable under `node --test` with no DOM.
 */

export interface Environment {
  /** Running on Android, where `intent:` URIs mean something. */
  isAndroid: boolean
  /** A Chromium-based browser, which is what implements `intent:` navigation. */
  isChromium: boolean
  /** `intent:` URIs will plausibly be honoured. */
  canUseIntentUris: boolean
  /** There is a document to render into, so `window.print()` is meaningful. */
  canUseWindowPrint: boolean
}

/** Whether this browser can plausibly launch an `intent:` URI. */
export function canUseIntentUris(): boolean {
  return detectEnvironment().canUseIntentUris
}

/** Sniff the environment. Safe to call in Node: every global is guarded. */
export function detectEnvironment(): Environment {
  const navigatorLike = typeof navigator === 'undefined' ? undefined : navigator
  const userAgent = navigatorLike?.userAgent ?? ''

  const isAndroid = /Android/i.test(userAgent)
  // CriOS is Chrome on iOS, which is WebKit under the hood and does not handle `intent:`.
  const isChromium = /Chrome|Chromium|Edg\//i.test(userAgent) && !/CriOS/i.test(userAgent)

  return {
    isAndroid,
    isChromium,
    canUseIntentUris: isAndroid && isChromium,
    canUseWindowPrint: typeof window !== 'undefined' && typeof document !== 'undefined'
  }
}

export type IntentLaunchMode = 'anchor' | 'location'

export interface OpenIntentOptions {
  /**
   * `anchor` (default) clicks a temporary link; `location` assigns `window.location.href`.
   *
   * `anchor` is preferred: if the app is missing and no fallback URL is set, assigning
   * `location` replaces the page the user was on, which loses their work. The original library
   * used `location`, which is why a failed print could leave a blank tab.
   */
  mode?: IntentLaunchMode | undefined
}

/**
 * Hand an `intent:` URI to Android.
 *
 * Must be called from a user gesture. Chrome blocks external-protocol launches that are not
 * user-initiated, so calling this from a timer or a `fetch` callback fails silently — which is
 * the single most common bug in RawBT integrations.
 */
export function openIntentUri(uri: string, options: OpenIntentOptions = {}): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('openIntentUri needs a browser environment')
  }

  if (options.mode === 'location') {
    window.location.href = uri
    return
  }

  const anchor = document.createElement('a')
  anchor.href = uri
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/**
 * Render markup off-screen and hand it to the Android print dialog.
 *
 * The page is loaded into a hidden same-origin iframe rather than a popup, because a popup
 * triggered after an `await` loses the user gesture and is blocked. An iframe keeps the whole
 * flow inside the original click.
 */
export function printHtmlInIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('printHtmlInIframe needs a browser environment'))
      return
    }

    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '1px'
    frame.style.height = '1px'
    frame.style.border = '0'
    frame.style.opacity = '0'
    frame.style.pointerEvents = 'none'

    frame.addEventListener('load', () => {
      const frameWindow = frame.contentWindow
      if (!frameWindow) {
        cleanup()
        reject(new Error('The print frame did not load'))
        return
      }

      try {
        frameWindow.focus()
        frameWindow.print()
      } catch (error) {
        cleanup()
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      // Removed on a timer rather than immediately: tearing the frame down while the print
      // dialog is still open cancels the job on some Android builds.
      window.setTimeout(cleanup, 1000)
      resolve()
    })

    frame.addEventListener('error', () => {
      cleanup()
      reject(new Error('The print frame failed to load'))
    })

    function cleanup(): void {
      frame.remove()
    }

    document.body.appendChild(frame)
    frame.srcdoc = html
  })
}
