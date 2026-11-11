import { describe, expect, it } from "vitest";
import {
  DOMANDE_PER_AREA,
  areaSilvio,
  badgePriorita,
  domandeRapide,
  prioritaDalBriefing,
} from "../domandeRapide";

describe("domande rapide della Regia Silvio", () => {
  it("riconosce l'area dal percorso", () => {
    expect(areaSilvio("/azienda/marketing")).toBe("marketing");
    expect(areaSilvio("/azienda/crm/contatti")).toBe("marketing");
    expect(areaSilvio("/azienda/marketing/preventivi")).toBe("preventivi");
    expect(areaSilvio("/azienda/commesse/123")).toBe("commesse");
    expect(areaSilvio("/azienda/ordini")).toBe("commesse");
    expect(areaSilvio("/azienda/ordini-acquisto")).toBe("acquisti");
    expect(areaSilvio("/azienda/ddt")).toBe("acquisti");
    expect(areaSilvio("/azienda/fatturazione/editor/abc")).toBe("fatturazione");
    expect(areaSilvio("/azienda/tesoreria")).toBe("fatturazione");
    expect(areaSilvio("/azienda/personale")).toBe("personale");
    expect(areaSilvio("/azienda/campo/rapportini")).toBe("personale");
    expect(areaSilvio("/azienda")).toBe("home");
    expect(areaSilvio("/azienda/cruscotto")).toBe("home");
    expect(areaSilvio("/azienda/impostazioni")).toBe("generale");
  });

  it("usa l'etichetta del contesto quando il percorso non basta", () => {
    expect(areaSilvio("/azienda/qualcosa", "Commessa")).toBe("commesse");
    expect(areaSilvio("/azienda/qualcosa", "Cassa")).toBe("fatturazione");
    expect(areaSilvio("/azienda/qualcosa", "Etichetta sconosciuta")).toBe("generale");
  });

  it("in Marketing propone domande concrete sui lead e sulle campagne", () => {
    const d = domandeRapide("/azienda/marketing", "Marketing").map((x) => x.domanda);
    expect(d).toContain("Quali lead richiamare oggi?");
    expect(d).toContain("Come stanno andando le campagne?");
  });

  it("l'admin ha le sue domande, ovunque si trovi", () => {
    expect(domandeRapide("/admin/aziende", null, "admin")).toEqual([...DOMANDE_PER_AREA.admin]);
  });

  it("ogni area ha da 3 a 4 domande, chip corti e senza doppioni", () => {
    for (const [area, domande] of Object.entries(DOMANDE_PER_AREA)) {
      expect(domande.length, area).toBeGreaterThanOrEqual(3);
      expect(domande.length, area).toBeLessThanOrEqual(4);
      expect(new Set(domande.map((x) => x.etichetta)).size, area).toBe(domande.length);
      expect(new Set(domande.map((x) => x.domanda)).size, area).toBe(domande.length);
      // due chip per riga in un pannello da 380 px
      for (const { etichetta, domanda } of domande) {
        expect(etichetta.length, etichetta).toBeLessThanOrEqual(26);
        expect(domanda.trim(), etichetta).not.toBe("");
      }
    }
  });
});

describe("priorità e badge: solo dal briefing vero", () => {
  it("senza briefing niente priorità e niente badge", () => {
    expect(prioritaDalBriefing(null)).toEqual([]);
    expect(badgePriorita(null)).toEqual({ conteggio: 0, nonLetto: false });
    expect(badgePriorita(undefined).conteggio).toBe(0);
  });

  it("un briefing senza punti non accende il badge", () => {
    expect(badgePriorita({ key_points: [], read_at: null })).toEqual({ conteggio: 0, nonLetto: false });
    expect(badgePriorita({ key_points: [{ text: "  " }], read_at: null }).conteggio).toBe(0);
  });

  it("conta i punti veri e dice se il briefing è ancora da leggere", () => {
    const punti = [{ text: "Chiama Rossi" }, { text: "Fattura 12 scaduta", severity: "urgent" as const }];
    expect(badgePriorita({ key_points: punti, read_at: null })).toEqual({ conteggio: 2, nonLetto: true });
    expect(badgePriorita({ key_points: punti, read_at: "2026-11-11T08:00:00Z" })).toEqual({ conteggio: 2, nonLetto: false });
  });

  it("al massimo quattro punti", () => {
    const punti = Array.from({ length: 7 }, (_, i) => ({ text: `Punto ${i}` }));
    expect(prioritaDalBriefing({ key_points: punti })).toHaveLength(4);
  });
});
