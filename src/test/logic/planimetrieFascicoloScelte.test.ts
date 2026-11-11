import { describe, expect, it } from "vitest";
import { descriviScelteFascicolo, richiesteFascicolo } from "@/lib/planimetrie/fascicoloScelte";

describe("tutte le scelte attive nel fascicolo", () => {
  it("il fascicolo distingue le richieste dalla legenda automatica per il modello AI", () => {
    expect(richiesteFascicolo("AUTHORITATIVE SOURCE FIXTURE POSITIONS: WC 65%\nRovere naturale.\nTieni i mobili.")).toBe("Rovere naturale.\nTieni i mobili.");
    expect(richiesteFascicolo(null)).toBe("");
  });
  it("la parete d'accento descrive il proprio colore e non quello di base inattivo", () => {
    const testo = descriviScelteFascicolo({ verniciatura: { attivo: true, applica_a: "parete_accento", colore_nome: "base bianca", colore_hex: "#FFFFFF", colore_accento_nome: "Blu", colore_accento_hex: "#123456" } }).join(" ");
    expect(testo).toContain("Blu"); expect(testo).toContain("#123456"); expect(testo).not.toContain("#FFFFFF");
  });
  it("include colori e interventi di cucina, soffitto, luci e disposizione senza UUID o JSON", () => {
    const testo = descriviScelteFascicolo({ restyling_cucina: { attivo: true, materiale_frontali: "legno", colore_frontali_hex: "#654321", piano_lavoro_materiale: "quarzo", colore_piano_lavoro_hex: "#EEEEEE", cambia_piano_cottura: false }, soffitto: { attivo: true, tipo: "travi_legno", colore_travi: "#123456" }, illuminazione: { attivo: true, temperatura: "calda_2700k" }, spazi_dettagli: { attivo: true, elementi_da_mantenere: "tavolo", elementi_da_aggiungere: "poltrona" }, catalogo_reference_ids: ["identificativo-tecnico"] }).join(" ");
    for (const atteso of ["#654321", "#EEEEEE", "Cambia piano cottura: no", "#123456", "2700k", "tavolo", "poltrona"]) expect(testo).toContain(atteso);
    expect(testo).not.toContain("identificativo-tecnico");
  });
});
