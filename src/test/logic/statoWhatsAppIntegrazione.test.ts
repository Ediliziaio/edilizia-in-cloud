/**
 * Integrazioni → «WhatsApp Business»: lo stato guarda tutti i numeri dell'azienda (09/10/2026).
 *
 * Prima la scheda leggeva solo il numero «Operativo / Cantieri» (`.eq("purpose", "bot_operativo")`): 3 aziende su 4
 * con numeri attivi (Marketing o Lead, su cui i messaggi arrivavano) vedevano «Non collegato» e «Configura».
 */
import { describe, expect, it } from "vitest";
import {
  COLONNE_STATO_WHATSAPP,
  statoWhatsAppDaiNumeri,
  type NumeroPerStato,
} from "@/lib/impostazioni/statoWhatsAppIntegrazione";

const numero = (extra: Partial<NumeroPerStato> = {}): NumeroPerStato => ({
  stato: "active",
  webhook_verified: true,
  numero: "+39 352 296 3510",
  ...extra,
});

describe("stato della scheda WhatsApp in Integrazioni", () => {
  it("senza numeri: non collegato", () => {
    expect(statoWhatsAppDaiNumeri([])).toEqual({ status: "disconnected", detail: null });
  });

  it("un numero attivo di qualunque scopo (Marketing, Lead…) basta per «collegato»", () => {
    // La lista non porta lo scopo: è proprio questo il punto, lo scopo non conta.
    expect(statoWhatsAppDaiNumeri([numero()])).toEqual({ status: "connected", detail: "Numero: +39 352 296 3510" });
  });

  it("più numeri attivi: dice quanti", () => {
    const stato = statoWhatsAppDaiNumeri([numero(), numero({ numero: "+39 333 111 2222" }), numero({ stato: "suspended" })]);
    expect(stato).toEqual({ status: "connected", detail: "2 numeri collegati" });
  });

  it("attivo ma senza numero scritto: non inventa un numero", () => {
    expect(statoWhatsAppDaiNumeri([numero({ numero: null })]).detail).toBe("1 numero collegato");
  });

  it("un numero rimosso non conta", () => {
    expect(statoWhatsAppDaiNumeri([numero({ stato: "removed" })])).toEqual({ status: "disconnected", detail: null });
    expect(statoWhatsAppDaiNumeri([numero({ stato: "removed" }), numero({ numero: "+39 000" })]).detail).toBe("Numero: +39 000");
  });

  it("attivo ma non verificato da Meta: in sospeso, con le parole della scheda del numero", () => {
    expect(statoWhatsAppDaiNumeri([numero({ webhook_verified: false })])).toEqual({
      status: "pending",
      detail: "Webhook da verificare",
    });
    expect(statoWhatsAppDaiNumeri([numero({ stato: "pending_verification", webhook_verified: null })])).toEqual({
      status: "pending",
      detail: "In verifica",
    });
  });

  it("sospeso: da sistemare", () => {
    expect(statoWhatsAppDaiNumeri([numero({ stato: "suspended" })])).toEqual({ status: "warning", detail: "Sospeso" });
  });

  it("più numeri e nessuno attivo: lo dice col conto", () => {
    expect(statoWhatsAppDaiNumeri([numero({ stato: "suspended" }), numero({ stato: "pending" })])).toEqual({
      status: "pending",
      detail: "Nessuno dei 2 numeri è attivo",
    });
  });
});

describe("cosa si legge dal database", () => {
  it("solo colonne senza segreti (token e PIN non arrivano mai al browser)", () => {
    expect(COLONNE_STATO_WHATSAPP).not.toContain("*");
    expect(COLONNE_STATO_WHATSAPP).not.toMatch(/access_token|cloud_api_pin/);
  });
});
