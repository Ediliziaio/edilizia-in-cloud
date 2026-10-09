// src/test/logic/permessoConfigurazioneOrdiniDescrizione.test.ts
// Chi dà il permesso «Configurazione Ordini» a una persona legge questa riga: deve elencare quello che il permesso apre
// davvero (le pagine del gruppo «Cantieri & Costi» con questo permesso) e non cose che non ci sono più.
import { describe, expect, it } from "vitest";
import { IMPOSTAZIONI_SECTIONS } from "@/components/users/permissionsDefaults";

const descrizione = IMPOSTAZIONI_SECTIONS.find((s) => s.label === "Configurazione Ordini")?.description ?? "";

describe("descrizione del permesso «Configurazione Ordini»", () => {
  it.each([
    "Stati della commessa",
    "fasi e avanzamento",
    "modelli di pagamento",
    "cartelle documenti",
    "rapportini",
    "squadre e calendari lavori",
    "codici QR",
  ])("nomina «%s»", (voce) => {
    expect(descrizione).toContain(voce);
  });

  it("non parla più di «numerazioni» (il numero del preventivo sta in Prezzo e margini) né di «stati ordine»", () => {
    expect(descrizione).not.toMatch(/numerazion/i);
    expect(descrizione).not.toMatch(/stati ordine/i);
  });

  it("il permesso resta quello di prima: stesse chiavi di vista e modifica", () => {
    const voce = IMPOSTAZIONI_SECTIONS.find((s) => s.label === "Configurazione Ordini");
    expect(voce?.viewKey).toBe("can_view_settings_orders");
    expect(voce?.editKey).toBe("can_edit_settings_orders");
  });
});
