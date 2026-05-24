import { describe, expect, it } from "vitest";

import {
  filterChatProfiles,
  isAllowedSilvioUpload,
  latestMessageByChannel,
  normalizeDmUserIds,
  parseStoredAttachmentUrl,
} from "@/lib/internalChat";

describe("internal chat optimizations", () => {
  it("keeps the newest sidebar preview per channel even when rows are mixed", () => {
    const latest = latestMessageByChannel([
      { id: "old-a", channel_id: "a", created_at: "2026-05-23T08:00:00.000Z" },
      { id: "new-b", channel_id: "b", created_at: "2026-05-23T12:00:00.000Z" },
      { id: "new-a", channel_id: "a", created_at: "2026-05-23T13:00:00.000Z" },
      { id: "old-b", channel_id: "b", created_at: "2026-05-23T07:00:00.000Z" },
    ]);

    expect(latest.a?.id).toBe("new-a");
    expect(latest.b?.id).toBe("new-b");
  });

  it("normalizes DM participants into a stable pair", () => {
    expect(normalizeDmUserIds("user-z", "user-a")).toEqual(["user-a", "user-z"]);
    expect(normalizeDmUserIds("same-user", "same-user")).toEqual(["same-user"]);
  });

  it("filters profile dialogs by name or email and excludes the current user", () => {
    const profiles = [
      { id: "me", first_name: "Demo", last_name: "Admin", email: "demo@azienda.srl" },
      { id: "1", first_name: "Marco", last_name: "Bianchi", email: "marco@azienda.srl" },
      { id: "2", first_name: "Giulia", last_name: "Ufficio", email: "giulia@azienda.srl" },
    ];

    expect(filterChatProfiles(profiles, "me", "bian").map((p) => p.id)).toEqual(["1"]);
    expect(filterChatProfiles(profiles, "me", "azienda").map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("allows Silvio only image and PDF uploads", () => {
    expect(isAllowedSilvioUpload({ name: "foto.jpg", type: "image/jpeg" })).toBe(true);
    expect(isAllowedSilvioUpload({ name: "fattura.pdf", type: "application/pdf" })).toBe(true);
    expect(isAllowedSilvioUpload({ name: "payload.svg", type: "image/svg+xml" })).toBe(false);
    expect(isAllowedSilvioUpload({ name: "script.html", type: "text/html" })).toBe(false);
  });

  it("parses persistent storage attachment references", () => {
    expect(parseStoredAttachmentUrl("storage://chat-attachments/company/channel/file.pdf")).toEqual({
      bucket: "chat-attachments",
      path: "company/channel/file.pdf",
    });
    expect(parseStoredAttachmentUrl("https://example.test/signed-url")).toBeNull();
    expect(parseStoredAttachmentUrl("storage://bad")).toBeNull();
  });
});
