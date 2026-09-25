// The trailing slash selects the installed browser package, not Node's built-in
// `buffer` module (which Vite externalizes in browser builds).
import { Buffer as BrowserBuffer } from "buffer/";

/**
 * @react-pdf/layout's fetchImage uses a free Buffer.isBuffer reference when
 * assigning image cache keys. Install only that missing browser global, at
 * the PDF entry point; keep Node's or an existing application's Buffer intact.
 */
export function ensurePdfBufferCompatibility(): void {
  const runtime: { Buffer?: unknown } = globalThis;
  if (typeof runtime.Buffer === "undefined") runtime.Buffer = BrowserBuffer;
}
