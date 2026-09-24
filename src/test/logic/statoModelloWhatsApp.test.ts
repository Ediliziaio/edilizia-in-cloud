/**
 * Il modello WhatsApp approvato da Meta risulta approvato da solo (24/09/2026).
 *
 * Meta avvisa (message_template_status_update) quando approva, rifiuta o mette
 * in pausa un modello. Prima l'avviso finiva solo nel registro e
 * wa_meta_templates — letta da automazioni, broadcast e chat — restava «in
 * attesa» fino alla sincronizzazione ogni 6 ore.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lingueDelModello, statoDopoAvvisoMeta } from "../../../supabase/functions/whatsapp-webhook/statoModello";

describe("stato del modello dopo l'avviso di Meta", () => {
  it("approvato, rifiutato, in pausa e disattivato si scrivono così come arrivano", () => {
    expect(statoDopoAvvisoMeta("APPROVED")).toBe("APPROVED");
    expect(statoDopoAvvisoMeta("rejected")).toBe("REJECTED");
    expect(statoDopoAvvisoMeta("PAUSED")).toBe("PAUSED");
    expect(statoDopoAvvisoMeta("DISABLED")).toBe("DISABLED");
  });

  it("riattivato vuol dire di nuovo usabile; segnalato non cambia niente", () => {
    expect(statoDopoAvvisoMeta("REINSTATED")).toBe("APPROVED");
    expect(statoDopoAvvisoMeta("FLAGGED")).toBeNull();
    expect(statoDopoAvvisoMeta("")).toBeNull();
    expect(statoDopoAvvisoMeta(undefined)).toBeNull();
  });

  it("«it_IT» e «it» sono la stessa lingua", () => {
    expect(lingueDelModello("it")).toEqual(["it"]);
    expect(lingueDelModello("it_IT")).toEqual(["it_IT", "it"]);
    expect(lingueDelModello(null)).toEqual([]);
  });
});

describe("webhook WhatsApp: l'avviso aggiorna il modello", () => {
  const router = readFileSync(join(process.cwd(), "supabase/functions/whatsapp-webhook/router.ts"), "utf8");
  const gestore = router.slice(router.indexOf("async function handleTemplateStatusUpdate"));

  it("dopo il registro aggiorna wa_meta_templates, per i numeri di quell'account", () => {
    expect(gestore).toContain("await aggiornaStatoModello(supabase, wabaId, value);");
    expect(gestore).toMatch(/from\("ai_whatsapp_numbers"\)\s*\.select\("id"\)\s*\.eq\("waba_id", wabaId\)/);
    expect(gestore).toMatch(/from\("wa_meta_templates"\)\s*\.update\(\{ status: stato/);
    expect(gestore).toContain('.eq("template_name", nome)');
  });

  it("un errore non torna mai a Meta: l'aggiornamento è dentro try/catch", () => {
    const aggiorna = router.slice(router.indexOf("async function aggiornaStatoModello"));
    expect(aggiorna.indexOf("try {")).toBeGreaterThan(-1);
    expect(aggiorna.indexOf("try {")).toBeLessThan(aggiorna.indexOf('from("wa_meta_templates")'));
    expect(aggiorna).toContain("} catch (err) {");
  });

  it("la parte dei messaggi resta com'era", () => {
    expect(router).toContain('if (change.field !== "messages") continue;');
    expect(router).toContain("await handleDeliveryStatus(supabase, status);");
  });
});
