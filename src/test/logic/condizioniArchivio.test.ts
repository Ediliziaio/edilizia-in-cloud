import { describe, expect, it } from "vitest";
import {
  AMBITI_CONDIZIONI, CLAUSOLE_DI_PARTENZA, CONTROPARTE, DOVE_SI_USA, NOMI_AMBITI,
  condizioniDelDocumento, daCongelare, daRiscrivere, modelloPredefinito, raccontaOrigine, testoDelModello,
  type ModelloCondizioni,
} from "@/lib/condizioni/archivio";

const modello = (p: Partial<ModelloCondizioni> = {}): ModelloCondizioni => ({
  id: "m1", nome: "Condizioni standard", ambito: "preventivo", predefinito: true, attivo: true, versione: 3,
  clausole: [
    { titolo: "Pagamenti", testo: "30% alla firma, saldo a fine lavori." },
    { titolo: "Garanzie", testo: "Garanzia di due anni sulle opere." },
  ],
  ...p,
});

describe("Da dove pescano le condizioni i documenti", () => {
  it("la copia sul documento vince sempre: un modello aggiornato non tocca un documento già emesso", () => {
    const r = condizioniDelDocumento({
      testoDelDocumento: "Pagamento a 60 giorni, concordato con questo cliente.",
      ambito: "preventivo", modelli: [modello()],
    });
    expect(r).toMatchObject({ fonte: "documento" });
    expect(r.testo).toContain("60 giorni");
  });

  it("senza copia propria prende il modello predefinito di quell'ambito", () => {
    const r = condizioniDelDocumento({ ambito: "preventivo", modelli: [modello()] });
    expect(r.fonte).toBe("modello");
    expect(r.testo).toContain("Pagamenti");
    expect(r.testo).toContain("saldo a fine lavori");
  });

  it("ogni ambito ha il suo: il modello dei subappalti non finisce su un preventivo", () => {
    const modelli = [modello({ id: "sub", nome: "Subappalto", ambito: "subappalto", clausole: [{ titolo: "Sicurezza", testo: "Oneri a carico." }] })];
    expect(condizioniDelDocumento({ ambito: "preventivo", modelli, testoDiSistema: "Testo di sistema" }).fonte).toBe("sistema");
    expect(condizioniDelDocumento({ ambito: "subappalto", modelli }).testo).toContain("Sicurezza");
  });

  it("senza modello e senza testo di sistema non inventa niente", () => {
    expect(condizioniDelDocumento({ ambito: "lavoro", modelli: [] })).toEqual({ testo: "", fonte: "nessuna" });
  });

  it("un modello archiviato o non predefinito non vale", () => {
    expect(modelloPredefinito([modello({ attivo: false })], "preventivo")).toBeNull();
    expect(modelloPredefinito([modello({ predefinito: false })], "preventivo")).toBeNull();
  });

  it("le clausole vuote non sporcano il testo", () => {
    expect(testoDelModello(modello({ clausole: [{ titolo: "", testo: "" }, { titolo: "<p> </p>", testo: " " }] }))).toBe("");
  });

  it("il titolo non esce due volte quando il testo si apre già con quel titolo", () => {
    // Il caso dei contratti importati interi: clausola «Termini legali», testo che comincia con «# Termini legali».
    const importato = testoDelModello({ clausole: [{ titolo: "Termini legali", testo: "# Termini legali\n\n## Recesso\nEntro 14 giorni." }] });
    expect(importato.startsWith("# Termini legali")).toBe(true);
    expect(importato.match(/Termini legali/g)).toHaveLength(1);
  });

  it("un titolo diverso dalla prima riga resta al suo posto", () => {
    const testo = testoDelModello({ clausole: [{ titolo: "Garanzie", testo: "# Condizioni generali\nDue anni sulle opere." }] });
    expect(testo.startsWith("Garanzie\n# Condizioni generali")).toBe(true);
  });
});

describe("Ogni ambito è spiegato, e le clausole di partenza sono vere clausole", () => {
  it("ogni tipo di documento dice dove finisce il testo, e a chi va", () => {
    for (const a of AMBITI_CONDIZIONI) {
      expect(NOMI_AMBITI[a], a).toBeTruthy();
      expect(DOVE_SI_USA[a]?.length, a).toBeGreaterThan(20);
      expect(CONTROPARTE[a], a).toBeTruthy();
    }
  });

  it("le clausole di partenza hanno titolo, testo e categoria, e le vessatorie sono segnate", () => {
    expect(CLAUSOLE_DI_PARTENZA.length).toBeGreaterThan(5);
    for (const c of CLAUSOLE_DI_PARTENZA) {
      expect(c.titolo.trim()).not.toBe("");
      expect(c.testo.length).toBeGreaterThan(40);
      expect(c.categoria.trim()).not.toBe("");
    }
    expect(CLAUSOLE_DI_PARTENZA.some((c) => c.vessatoria)).toBe(true);
    // Un modello costruito con tutte è testo stampabile, non righe vuote.
    expect(testoDelModello({ clausole: [...CLAUSOLE_DI_PARTENZA] }).split("\n\n")).toHaveLength(CLAUSOLE_DI_PARTENZA.length);
  });
});

describe("Quando il documento parte: si congela", () => {
  it("copia il testo del modello e segna da quale modello e versione", () => {
    const p = daCongelare({ ambito: "preventivo", modelli: [modello()] }, "2026-11-07T10:00:00.000Z");
    expect(p?.condizioni_testo).toContain("Garanzie");
    expect(p?.condizioni_origine).toMatchObject({ modello_id: "m1", modello_nome: "Condizioni standard", versione: 3, congelate_il: "2026-11-07T10:00:00.000Z" });
  });

  it("un documento che ha già le sue condizioni non si tocca", () => {
    expect(daCongelare({ testoDelDocumento: "Le sue.", ambito: "preventivo", modelli: [modello()] })).toBeNull();
  });

  it("senza niente da congelare non scrive niente", () => {
    expect(daCongelare({ ambito: "acquisto", modelli: [] })).toBeNull();
  });
});

describe("Quando qualcuno riscrive una clausola", () => {
  it("tiene da quale modello partiva e aggiunge chi e quando", () => {
    const prima = daCongelare({ ambito: "preventivo", modelli: [modello()] }, "2026-11-07T10:00:00.000Z")!;
    const dopo = daRiscrivere("Testo riscritto.", prima.condizioni_origine, "Mario Rossi", ["Pagamenti"], "2026-11-07T11:00:00.000Z");
    expect(dopo.condizioni_testo).toBe("Testo riscritto.");
    expect(dopo.condizioni_origine).toMatchObject({
      modello_id: "m1", modello_nome: "Condizioni standard", versione: 3,
      clausole_riscritte: ["Pagamenti"], riscritte_da: "Mario Rossi", riscritte_il: "2026-11-07T11:00:00.000Z",
    });
  });

  it("il modello non si muove: resta quello di prima", () => {
    const m = modello();
    daRiscrivere("Altro testo.", { modello_id: m.id, versione: m.versione }, "Luca");
    expect(m.clausole).toHaveLength(2);
    expect(m.versione).toBe(3);
  });
});

describe("Cosa si legge sulla scheda", () => {
  it("dice che sono riscritte, da chi, e da quale modello partivano", () => {
    const t = raccontaOrigine({ modello_nome: "Condizioni standard", versione: 3, riscritte_da: "Mario Rossi", riscritte_il: "2026-11-07T11:00:00.000Z" }, "documento");
    expect(t).toMatch(/Riscritte per questo documento da Mario Rossi/);
    expect(t).toMatch(/modello «Condizioni standard», versione 3/);
  });

  it("dice che sono fissate e che il modello non le tocca più", () => {
    expect(raccontaOrigine({ modello_nome: "Standard", versione: 2, congelate_il: "2026-11-07T10:00:00.000Z" }, "documento"))
      .toMatch(/non tocca più questo documento/);
  });

  it("finché il documento non parte, segue il modello", () => {
    expect(raccontaOrigine(null, "modello")).toMatch(/segue il modello/);
    expect(raccontaOrigine(null, "sistema")).toMatch(/non ha ancora un modello suo/);
    expect(raccontaOrigine(null, "nessuna")).toMatch(/Nessuna condizione/);
  });
});
