import { describe, expect, it } from "vitest";
import { statoRigaFornitore, totaleOffertoProposto } from "@/lib/acquisti/rigaFornitoreRdo";
import { aggiornamentoStatoVoce, notaVoceOfferta, statoVoceOfferta } from "@/lib/acquisti/statoVoceOfferta";
import { confrontoOfferta } from "@/lib/acquisti/confronto";

describe("totaleOffertoProposto", () => {
  it("un totale scritto a mano vince e non si tocca", () => {
    expect(totaleOffertoProposto(3800, 3650)).toEqual({ valore: 3800, origine: "scritto" });
    expect(totaleOffertoProposto(0, 3650)).toEqual({ valore: 0, origine: "scritto" });
  });
  it("vuoto: propone la somma delle voci del confronto, col trasporto se è extra", () => {
    expect(totaleOffertoProposto(null, 3650)).toEqual({ valore: 3650, origine: "voci" });
    expect(totaleOffertoProposto(null, 3798, 80)).toEqual({ valore: 3798, origine: "voci_e_trasporto" });
    expect(totaleOffertoProposto(null, null)).toBeNull();
  });
  it("propone lo stesso numero che usano confronto e aggiudicazione a totale vuoto", () => {
    const f: Parameters<typeof confrontoOfferta>[0] = { status: "risposta", totale_offerto: null, validita_offerta: null, trasporto_tipo: "extra", costo_trasporto: 80 };
    const c = confrontoOfferta(f, { totale: 3718, righeCoperte: 6, daRighe: true }, 6, "2026-11-11");
    expect(totaleOffertoProposto(f.totale_offerto, c.totale, 80)?.valore).toBe(3798);
  });
});

describe("statoRigaFornitore", () => {
  const oggi = "2026-11-11";
  it("risposta, declinata, da inviare", () => {
    expect(statoRigaFornitore({ status: "risposta" }, null, oggi)).toBe("ha_risposto");
    expect(statoRigaFornitore({ status: "rifiutata" }, null, oggi)).toBe("ha_declinato");
    expect(statoRigaFornitore({ status: "da_inviare" }, null, oggi)).toBe("da_inviare");
  });
  it("in attesa diventa da sollecitare a scadenza passata, o dopo 5 giorni senza scadenza", () => {
    expect(statoRigaFornitore({ status: "inviata", inviata_at: "2026-11-10T09:00:00Z" }, "2026-11-20", oggi)).toBe("in_attesa");
    expect(statoRigaFornitore({ status: "inviata", inviata_at: "2026-11-10T09:00:00Z" }, "2026-11-10", oggi)).toBe("sollecitare");
    expect(statoRigaFornitore({ status: "inviata", inviata_at: "2026-11-08T09:00:00Z" }, null, oggi)).toBe("in_attesa");
    expect(statoRigaFornitore({ status: "inviata", inviata_at: "2026-11-06T09:00:00Z" }, null, oggi)).toBe("sollecitare");
  });
});

describe("statoVoceOfferta", () => {
  it("legge lo stato già salvato", () => {
    expect(statoVoceOfferta(undefined)).toBe("da_quotare");
    expect(statoVoceOfferta({ disponibile: true, note: null })).toBe("disponibile");
    expect(statoVoceOfferta({ disponibile: false, note: null })).toBe("non_disponibile");
    expect(statoVoceOfferta({ disponibile: true, note: "[parziale] solo 200 pz" })).toBe("parziale");
    expect(statoVoceOfferta({ disponibile: true, note: "[alternativa]" })).toBe("alternativa");
  });
  it("cambia stato senza perdere la nota del fornitore", () => {
    expect(aggiornamentoStatoVoce("parziale", "solo 200 pz")).toEqual({ disponibile: true, note: "[parziale] solo 200 pz" });
    expect(aggiornamentoStatoVoce("alternativa", "[parziale] solo 200 pz")).toEqual({ disponibile: true, note: "[alternativa] solo 200 pz" });
    expect(aggiornamentoStatoVoce("non_disponibile", "[parziale] solo 200 pz")).toEqual({ disponibile: false, note: "solo 200 pz" });
    expect(aggiornamentoStatoVoce("disponibile", "[alternativa]")).toEqual({ disponibile: true, note: null });
    expect(notaVoceOfferta("[parziale] solo 200 pz")).toBe("solo 200 pz");
  });
});
