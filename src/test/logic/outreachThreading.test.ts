import { describe, it, expect } from "vitest";
import { buildFollowupHeaders, stripRe } from "../../../supabase/functions/_shared/outreach-threading";

describe("stripRe", () => {
  it("toglie i prefissi ripetuti in qualunque lingua", () => {
    expect(stripRe("Re: R: Fwd: Preventivi")).toBe("Preventivi");
    expect(stripRe("  I: Cantieri ")).toBe("Cantieri");
    expect(stripRe("Rendiconto")).toBe("Rendiconto"); // "Re" dentro la parola non conta
  });
});

describe("buildFollowupHeaders", () => {
  it("primo contatto: oggetto proprio, nessun header di thread, touch 1", () => {
    const h = buildFollowupHeaders([], "Gestione cantieri");
    expect(h).toEqual({ subject: "Gestione cantieri", inReplyTo: null, references: [], threadId: null, touch: 1 });
  });
  it("follow-up senza oggetto: Re: + oggetto del primo, In-Reply-To all'ultimo, References a tutti", () => {
    const h = buildFollowupHeaders([
      { messageId: "<a@x>", subject: "Gestione cantieri", threadId: "t1" },
      { messageId: "<b@x>", subject: "Re: Gestione cantieri" },
    ], "");
    expect(h.subject).toBe("Re: Gestione cantieri");
    expect(h.inReplyTo).toBe("<b@x>");
    expect(h.references).toEqual(["<a@x>", "<b@x>"]);
    expect(h.threadId).toBe("t1");
    expect(h.touch).toBe(3);
  });
  it("follow-up con oggetto proprio: lo usa ma resta nel thread", () => {
    const h = buildFollowupHeaders([{ messageId: "<a@x>", subject: "Ciao" }], "Un'altra idea");
    expect(h.subject).toBe("Un'altra idea");
    expect(h.inReplyTo).toBe("<a@x>");
  });
  it("passi precedenti senza Message-ID (legacy) non rompono: nessun In-Reply-To ma touch giusto", () => {
    const h = buildFollowupHeaders([{ messageId: null, subject: "Ciao" }], "");
    expect(h.inReplyTo).toBeNull();
    expect(h.references).toEqual([]);
    expect(h.subject).toBe("Re: Ciao");
    expect(h.touch).toBe(2);
  });
});
