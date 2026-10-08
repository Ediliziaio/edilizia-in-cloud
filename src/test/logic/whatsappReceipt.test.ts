import { describe, expect, it } from "vitest";
import { isWhatsAppReceipt, requireWhatsAppReceipt } from "../../../supabase/functions/_shared/whatsappReceipt";
import { erroreInvioWhatsApp } from "../../../supabase/functions/send-contact-message/invioWhatsApp";

describe("Provider acceptance is not inferred from HTTP success", () => {
  it.each([null, undefined, {}, [], { success: true }, { success: true, meta_message_id: " " },
    { success: false, meta_message_id: "wamid.fixture" },
    { success: true, meta_message_id: "wamid.fixture", error: "timeout" },
    { success: true, meta_message_id: "wamid.fixture", status: "unknown" },
    { success: true, meta_message_id: "wamid.fixture", status: "failed" }])("rejects incomplete or contradictory receipt %j", value => {
    expect(isWhatsAppReceipt(value)).toBe(false);
    expect(() => requireWhatsAppReceipt(value)).toThrow("Invio non confermato");
  });
  it("accepts original and replayed provider receipts, not claiming delivery", () => {
    for (const extra of [{}, { status: "sent" }, { replayed: true }]) {
      const receipt = { success: true, meta_message_id: "wamid.fixture", ...extra };
      expect(isWhatsAppReceipt(receipt)).toBe(true);
      expect(() => requireWhatsAppReceipt(receipt)).not.toThrow();
    }
  });
  it("does not label a malformed HTTP 200 as a definite Meta rejection", () => {
    expect(erroreInvioWhatsApp(200, { success: true })).toMatchObject({ status: 503, code: "delivery_unknown" });
  });
});
