/**
 * HTML escaping.
 *
 * In its own file with no imports so the renderers stay pure and testable under `node --test`.
 */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/**
 * Escape text for interpolation into markup.
 *
 * `'` is escaped as well as `"`, because it is easy to end up interpolating into an attribute
 * that someone later switches to single quotes.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character)
}
