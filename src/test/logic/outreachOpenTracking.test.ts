import { describe, it, expect } from "vitest";
import {
  computeOutreachOpenSig,
  verifyOutreachOpenSig,
} from "../../../supabase/functions/_shared/emailTrackingSignature";
import { snoozeUntil, type SnoozePreset } from "../../components/admin/outreach/useOutreachConversations";

/**
 * Open-tracking firma HMAC (outreach) + preset snooze — logica pura.
 *
 * computeOutreachOpenSig/verifyOutreachOpenSig firmano l'id riga outreach_send_queue
 * con HMAC-SHA256 nel namespace dedicato `outreach_open|<id>` (segreto passato come
 * argomento → testabili senza Deno.env). Il pixel viene servito dall'endpoint
 * outreach-track-open SOLO con firma valida.
 */
describe("outreach open-tracking signature", () => {
  const SECRET = "test-secret-abc123";
  const QID = "11111111-2222-3333-4444-555555555555";

  it("verifica con successo una firma generata con lo stesso segreto", async () => {
    const sig = await computeOutreachOpenSig(SECRET, QID);
    expect(sig).toMatch(/^[0-9a-f]{64}$/); // hex SHA-256
    expect(await verifyOutreachOpenSig(SECRET, QID, sig)).toBe(true);
  });

  it("rifiuta una firma assente o vuota", async () => {
    expect(await verifyOutreachOpenSig(SECRET, QID, null)).toBe(false);
    expect(await verifyOutreachOpenSig(SECRET, QID, "")).toBe(false);
    expect(await verifyOutreachOpenSig(SECRET, QID, undefined)).toBe(false);
  });

  it("rifiuta una firma valida per un ALTRO queueId (no riuso cross-riga)", async () => {
    const sig = await computeOutreachOpenSig(SECRET, QID);
    const otherQid = "99999999-8888-7777-6666-555555555555";
    expect(await verifyOutreachOpenSig(SECRET, otherQid, sig)).toBe(false);
  });

  it("rifiuta una firma calcolata con un segreto diverso", async () => {
    const sig = await computeOutreachOpenSig("altro-segreto", QID);
    expect(await verifyOutreachOpenSig(SECRET, QID, sig)).toBe(false);
  });

  it("è deterministica per la stessa coppia (segreto, queueId)", async () => {
    const a = await computeOutreachOpenSig(SECRET, QID);
    const b = await computeOutreachOpenSig(SECRET, QID);
    expect(a).toBe(b);
  });
});

describe("snoozeUntil presets", () => {
  // Base deterministica: lun 15 giu 2026, 14:30 locale.
  const FROM = new Date(2026, 5, 15, 14, 30, 0, 0);

  it("3h → +3 ore esatte", () => {
    const out = new Date(snoozeUntil("3h", FROM));
    expect(out.getTime()).toBe(FROM.getTime() + 3 * 60 * 60 * 1000);
  });

  it("tomorrow → domani alle 9:00 locali", () => {
    const out = new Date(snoozeUntil("tomorrow", FROM));
    expect(out.getDate()).toBe(16);
    expect(out.getHours()).toBe(9);
    expect(out.getMinutes()).toBe(0);
  });

  it("3d / 1w → +3 / +7 giorni", () => {
    const d3 = new Date(snoozeUntil("3d", FROM));
    const w1 = new Date(snoozeUntil("1w", FROM));
    expect(d3.getDate()).toBe(18);
    expect(w1.getDate()).toBe(22);
  });

  it("ogni preset produce un istante nel futuro rispetto a `from`", () => {
    const presets: SnoozePreset[] = ["3h", "tomorrow", "3d", "1w"];
    for (const p of presets) {
      expect(new Date(snoozeUntil(p, FROM)).getTime()).toBeGreaterThan(FROM.getTime());
    }
  });
});
