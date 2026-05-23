import { describe, expect, it } from "vitest";

import {
  getSocialMediaPreviewUrl,
  socialMediaFromRow,
  socialPostFromRow,
} from "@/lib/social/storage";

describe("social storage hardening", () => {
  it("normalizes invalid row enum values instead of leaking corrupted DB state into the UI", () => {
    expect(socialPostFromRow({ id: "p1", status: "owned", platforms: [] }).status).toBe("draft");

    const media = socialMediaFromRow({
      id: "m1",
      media_type: "script",
      format: "999:1",
      category: "private",
      title: "Bad row",
    });

    expect(media.type).toBe("image");
    expect(media.format).toBe("4:5");
    expect(media.category).toBe("portfolio");
  });

  it("rejects unsafe media preview URLs before they reach img src", () => {
    expect(getSocialMediaPreviewUrl({ public_url: "javascript:alert(1)" } as any)).toBeNull();
    expect(getSocialMediaPreviewUrl({ public_url: "http://evil.example/pixel.png" } as any)).toBeNull();
    expect(getSocialMediaPreviewUrl({ public_url: "https://cdn.example.com/image.webp" } as any)).toBe("https://cdn.example.com/image.webp");
    expect(getSocialMediaPreviewUrl({ thumbnail_url: "data:image/svg+xml;base64,PHN2Zy8+" } as any)).toBeNull();
    expect(getSocialMediaPreviewUrl({ thumbnail_url: "data:image/png;base64,iVBORw0KGgo=" } as any)).toBe("data:image/png;base64,iVBORw0KGgo=");
  });
});
