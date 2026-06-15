import { describe, it, expect } from "vitest";
import { buildRFC822 } from "../../../supabase/functions/_shared/imapSmtpClient";
describe("buildRFC822 header custom", () => {
  it("include gli header passati (List-Unsubscribe)", () => {
    const raw = buildRFC822({
      from: "a@x.com", to: ["b@y.com"], subject: "ciao",
      bodyHtml: "<p>hi</p>", messageId: "<1@x.com>",
      headers: { "List-Unsubscribe": "<https://u/x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    expect(raw).toContain("List-Unsubscribe: <https://u/x>");
    expect(raw).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  });
});
