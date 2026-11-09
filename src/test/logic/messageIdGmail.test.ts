import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { messageIdGmail } from "../../../supabase/functions/_shared/messageIdGmail";

const risposta = (ok: boolean, corpo: unknown, status = 200) => vi.fn(async () => ({ ok, status, json: async () => corpo }));

describe("il Message-ID di un'email spedita da Gmail", () => {
  it("si legge dalle intestazioni, senza guardare le maiuscole", async () => {
    const chiama = risposta(true, { payload: { headers: [{ name: "MESSAGE-ID", value: " <abc@mail.gmail.com> " }] } });
    expect(await messageIdGmail("t", "id1", chiama)).toBe("<abc@mail.gmail.com>");
    expect(String(chiama.mock.calls[0])).toContain("metadataHeaders=Message-ID");
  });

  it("se Gmail non risponde l'invio non fallisce", async () => {
    expect(await messageIdGmail("t", "id1", risposta(false, {}, 500))).toBeNull();
    expect(await messageIdGmail("t", "id1", vi.fn(async () => { throw new Error("rete"); }))).toBeNull();
  });
});

describe("il riconoscimento delle risposte", () => {
  it("guarda il Message-ID, e l'invio Gmail lo salva", () => {
    const sql = readFileSync("supabase/migrations/20290128110000_email_risposte_gmail_message_id.sql", "utf8");
    expect(sql).toMatch(/o\.rfc_message_id = p_in_reply_to/);
    expect(sql).toMatch(/o\.rfc_message_id = any/);
    expect(readFileSync("supabase/functions/email-send/index.ts", "utf8")).toMatch(/rfc_message_id: rfcMessageId/);
  });
});
