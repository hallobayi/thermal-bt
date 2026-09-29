/**
 * The exhaustiveness check every renderer ends its `switch` with.
 *
 * Shared rather than copied into each renderer, because the *point* of the check is that it is
 * impossible to forget: a renderer with its own private copy can be edited into a renderer whose
 * copy was deleted, and nothing would say so. One definition, three call sites.
 *
 * Its value is at compile time — `assertNever(operation)` only type-checks while `operation` is
 * `never`, which is what turns "someone added an operation and missed this renderer" into a build
 * error instead of a silently dropped receipt line. The throw is the runtime backstop for a caller
 * that reached a renderer with an operation the types do not know about.
 */

export function assertNever(value: never): never {
  throw new Error(`Unhandled print operation: ${JSON.stringify(value)}`)
}
