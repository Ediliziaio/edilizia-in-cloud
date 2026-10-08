import { describe, expect, it } from "vitest";
import { canonicalJson, confirmationHash, confirmationPreview, confirmationReplyMatches, freezeConfirmation, frozenConfirmationValid } from "../../../supabase/functions/whatsapp-ai-processor/frozenConfirmation";
import { validateToolArguments } from "../../../supabase/functions/whatsapp-ai-processor/toolArguments";
import { leggiStatoSessione, statoDaSalvare } from "../../../supabase/functions/_shared/botOperativoConferme";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

const ctx = { company_id: "company", waNumberId: "number", mediaCorrente: { storagePath: "fixture/receipt.jpg", url: "https://invalid.test/receipt.jpg", tipo: "image" } } as ToolCtx;
describe("Frozen approval payload", () => {
  it("hash ignores key ordering but detects amount, recipient or attachment changes", async () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    const frozen = await freezeConfirmation(ctx, "carica_scontrino", { importo: 25, esercente: "Fornitore demo" }, "message", new Date("2026-10-07T21:59:00Z"));
    expect(frozen.pending.parametri?.data).toBe("2026-10-07");
    expect(await frozenConfirmationValid(frozen.pending)).toBe(true);
    const changed = { ...frozen.pending, parametri: { ...frozen.pending.parametri, importo: 250 } };
    expect(await frozenConfirmationValid(changed)).toBe(false);
    expect(await confirmationHash("send", { to: "one" }, null)).not.toBe(await confirmationHash("send", { to: "two" }, null));
    expect(await frozenConfirmationValid({ ...frozen.pending, media: { ...ctx.mediaCorrente!, storagePath: "other.jpg" } })).toBe(false);
  });
  it("freezes local date/hour before midnight and retains payload through persisted session", async () => {
    const { pending } = await freezeConfirmation(ctx, "registra_presenza", { tipo: "uscita" }, "message", new Date("2026-10-07T21:59:00Z"));
    expect(pending.parametri).toEqual({ tipo: "uscita", ora: "23:59", data_evento: "2026-10-07" });
    const stored = statoDaSalvare({}, { conferma: pending }, new Date(pending.chiesta_il));
    expect(leggiStatoSessione(stored, new Date("2026-10-07T22:01:00Z")).conferma).toEqual(pending);
  });
  it("rejects a previous button rather than authorizing the latest request", async () => {
    const { pending } = await freezeConfirmation(ctx, "registra_presenza", { tipo: "entrata" }, "message");
    expect(confirmationReplyMatches(pending, { interactive: { button_reply: { id: `approve:${pending.id}` } } }, "interactive")).toBe(true);
    expect(confirmationReplyMatches(pending, { interactive: { button_reply: { id: "approve:old" } } }, "interactive")).toBe(false);
    expect(confirmationReplyMatches(pending, {}, "text")).toBe(true);
    expect(confirmationReplyMatches(null, {}, "interactive")).toBe(false);
  });
  it("never truncates long approval texts or accepts unserializable data", () => {
    expect(() => confirmationPreview("send", { body: "x".repeat(1100) })).toThrow("too_long");
    expect(() => canonicalJson({ amount: NaN })).toThrow();
    expect(() => canonicalJson({ amount: undefined })).toThrow();
  });
  it("validates actual typed, required and nested tool input before authorization", () => {
    const schema = { type: "object", required: ["amount"], additionalProperties: false,
      properties: { amount: { type: "number", minimum: 1 }, rows: { type: "array", items: { type: "object", required: ["quantity"], properties: { quantity: { type: "number" } } } } } };
    validateToolArguments(schema, { amount: 5, rows: [{ quantity: 2 }] });
    for (const args of [{}, { amount: "5" }, { amount: -2 }, { amount: 5, unknown: true }, { amount: 5, rows: [{}] }]) {
      expect(() => validateToolArguments(schema, args)).toThrow();
    }
  });
  it("requires the declared review constant, not merely a boolean", () => {
    const schema = { type: "object", required: ["reviewed"], properties: { reviewed: { type: "boolean", const: true } } };
    validateToolArguments(schema, { reviewed: true });
    for (const reviewed of [false, "true", 1, null]) expect(() => validateToolArguments(schema, { reviewed })).toThrow();
  });
  it.each(["constructor", "prototype", "__proto__"])("rejects inherited/dangerous argument %s", key => {
    const args = JSON.parse(`{"${key}":{}}`);
    expect(() => validateToolArguments({ type: "object", properties: {}, additionalProperties: false }, args)).toThrow();
  });
  it("enforces text constraints and typed additional fields", () => {
    const schema = { type: "object", properties: { code: { type: "string", minLength: 2, maxLength: 4, pattern: "^[A-Z]+$" } }, additionalProperties: { type: "number" } };
    validateToolArguments(schema, { code: "AB", amount: 3 });
    for (const args of [{ code: "A" }, { code: "ABCDE" }, { code: "ab" }, { code: "AB", amount: "3" }]) expect(() => validateToolArguments(schema, args)).toThrow();
  });
  it("shows explicit recipient/review labels in the PDF approval", () => {
    const preview = confirmationPreview("invia_pdf_modello_bagno", { artifact_id: "receipt", modello: "doccia", documento_verificato: true });
    expect(preview).toContain("al tuo WhatsApp (non al cliente)");
    expect(preview).toContain("Ricevuta PDF: receipt"); expect(preview).toContain("PDF controllato da te: Sì");
  });
});
