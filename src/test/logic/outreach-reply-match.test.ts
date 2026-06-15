import { describe, it, expect } from "vitest";
import { matchReplyToContact } from "../../../supabase/functions/_shared/outreach-reply-match";
describe("matchReplyToContact", () => {
  const contacts = [{ id: "c1", email: "mario@rossi.it" }, { id: "c2", email: "lucia@bianchi.it" }];
  it("match per indirizzo mittente (case-insensitive)", () => {
    expect(matchReplyToContact({ from: "Mario <MARIO@rossi.it>" }, contacts)?.id).toBe("c1");
  });
  it("nessun match → null", () => {
    expect(matchReplyToContact({ from: "x@y.com" }, contacts)).toBeNull();
  });
});
