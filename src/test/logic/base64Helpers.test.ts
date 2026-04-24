import { describe, expect, it } from "vitest";

import { bytesToBase64 } from "../../../supabase/functions/_shared/base64";

describe("edge base64 helpers", () => {
  it("encodes large image-like byte arrays without overflowing the call stack", () => {
    const bytes = new Uint8Array(240_000);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = i % 251;
    }

    const encoded = bytesToBase64(bytes);
    const decoded = atob(encoded);

    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(0)).toBe(bytes[0]);
    expect(decoded.charCodeAt(65_535)).toBe(bytes[65_535]);
    expect(decoded.charCodeAt(bytes.length - 1)).toBe(bytes[bytes.length - 1]);
  });
});
