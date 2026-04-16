import { protocol } from "electron";

/**
 * Registers safety-net handlers for custom URL schemes that would otherwise
 * surface as `ERR_UNKNOWN_URL_SCHEME` in the renderer console.
 *
 * The primary line of defence is `sanitizeRenderableUrl` at the extension
 * service boundary, which nulls any URL with an unrecognised scheme before it
 * reaches an `<img src>` on the renderer. This registration exists for
 * everything that slips past that boundary (markdown renderers, future RPC
 * payloads, iframes, third-party extension UIs) so Chromium silently 404s
 * instead of logging the loud unknown-scheme error on every mount.
 *
 * If one of these schemes ever gains real content (e.g. a connectors://
 * image cache), the handler can be upgraded to serve actual bytes without
 * any callers changing.
 */
const QUARANTINED_SCHEMES = ["connectors"] as const;

export function registerRendererProtocolHandlers(): void {
  for (const scheme of QUARANTINED_SCHEMES) {
    try {
      protocol.handle(scheme, () => new Response(null, {
        status: 404,
        statusText: "Not Found",
      }));
    } catch (error) {
      // A duplicate registration or a scheme that has already been privileged
      // should not crash bootstrap. Log and move on.
      console.warn(
        `[desktop:renderer-protocol] Could not register "${scheme}://" handler. ${formatError(error)}`,
      );
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
