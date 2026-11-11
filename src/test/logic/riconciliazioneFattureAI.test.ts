import { describe, expect, it } from "vitest";
import {
  datiRiconciliazione,
  esitiRiconciliazione,
  preparaRichiestaRiconciliazione,
  scelteAbbinamenti,
  validaPropostaRiconciliazione,
  type PropostaRiconciliazione,
} from "../../../supabase/functions/_shared/riconciliazioneFattureAI.ts";
import { scenarioRiconciliazione } from "../../../supabase/functions/_shared/riconciliazioneFattureScenari.ts";

const contesto = (nome = "due-ddt") => scenarioRiconciliazione(nome)!;
const proposta = (c = contesto()): PropostaRiconciliazione => ({
  righe: datiRiconciliazione(c).fattura.map((f) => ({
    fattura: f.id,
    ddt: datiRiconciliazione(c).bolle.map((r) => r.id),
    oda: ["o1-r1"],
    affidabilita: "alta",
    motivo: "Stesso prodotto A81 bianco da 25kg",
  })),
  avvisi: [],
});
describe("riconciliazione AI: il modello propone, i numeri si verificano nel codice", () => {
  it("se un altro revisore ha usato il DDT senza quantità valorizzate, richiede controllo", () => {
    const c = contesto();
    c.revisioni_precedenti = [{ fattura_id: "altra", riga_id: "d1-r1" }];
    expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe(
      "da_controllare",
    );
    c.valorizzazioni = [
      { fattura_id: "altra", ddt_id: "d1", riga_id: "d1-r1", quantita: 5 },
    ];
    expect(esitiRiconciliazione(c, proposta(c))[0]).toMatchObject({
      stato: "coerente",
      quantitaDisponibile: 45,
    });
  });
  it("un ordine annullato non conferma il prezzo", () => {
    const c = contesto();
    c.oda[0].stato = "cancelled";
    expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe(
      "da_controllare",
    );
  });

  it("collega descrizioni diverse e somma due consegne", () => {
    const c = contesto();
    expect(
      esitiRiconciliazione(c, validaPropostaRiconciliazione(proposta(c), c))[0],
    ).toMatchObject({ stato: "coerente", quantitaDisponibile: 50 });
  });
  it.each(["gia-fatturato", "doppia-riga", "prezzo-su-quantita"])(
    "trova lo scostamento: %s",
    (nome) => {
      const c = contesto(nome),
        e = esitiRiconciliazione(c, proposta(c));
      expect(e.some((r) => r.stato === "scostamento")).toBe(true);
      if (nome === "prezzo-su-quantita") expect(e[0].deltaImporto).toBe(4);
      if (nome === "doppia-riga") expect(e[1].quantitaDisponibile).toBe(5);
    },
  );
  it.each(["senza-prezzo", "unita-diverse"])(
    "non inventa la verifica: %s",
    (nome) => {
      const c = contesto(nome);
      expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe(
        "da_controllare",
      );
    },
  );
  it("non dà verde alle equivalenze incerte neppure con numeri uguali", () => {
    const c = contesto(),
      p = proposta();
    p.righe[0].affidabilita = "media";
    expect(esitiRiconciliazione(c, p)[0].stato).toBe("da_controllare");
  });
  it("non dà verde se manca il fornitore", () => {
    const c = contesto();
    c.fattura.fornitore_id = null;
    expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe(
      "da_controllare",
    );
  });
  it("non interpreta una nota di credito come una normale consegna", () => {
    const c = contesto();
    c.fattura.tipo_documento = "TD04";
    expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe(
      "da_controllare",
    );
  });
  it("un riferimento a una fattura precedente senza quantità rende il residuo incerto", () => {
    const c = contesto();
    c.altre_fatture = [
      { ddt_ricezione_id: "d1", fattura_ricevuta_id: "altra" },
    ];
    expect(esitiRiconciliazione(c, proposta(c))[0].stato).toBe(
      "da_controllare",
    );
  });
  it.each(["id-inventato", "ripetuta", "incompleta", "formato"])(
    "rifiuta risposte AI invalide: %s",
    (nome) => {
      const c = contesto(),
        p = proposta();
      if (nome === "id-inventato") p.righe[0].ddt.push("estraneo");
      if (nome === "ripetuta") p.righe[0].ddt.push("d1-r1");
      if (nome === "incompleta") p.righe = [];
      if (nome === "formato")
        (p.righe[0] as unknown as Record<string, unknown>).ddt = "d1-r1";
      expect(() => validaPropostaRiconciliazione(p, c)).toThrow();
    },
  );
  it("riordina le proposte secondo la fattura senza perdere voci", () => {
    const c = contesto("doppia-riga"),
      p = proposta(c);
    p.righe.reverse();
    expect(
      validaPropostaRiconciliazione(p, c).righe.map((r) => r.fattura),
    ).toEqual(["1", "2"]);
  });
  it("non riutilizza un abbinamento rifiutato", () => {
    const p = proposta();
    expect(scelteAbbinamenti(p, { "1": "rifiutata" }).get("1")).toEqual({
      ddt: [],
      oda: [],
    });
    expect(
      scelteAbbinamenti(p, { "1": "accettata" }).get("1")?.ddt,
    ).toHaveLength(2);
  });
  it("non tronca silenziosamente le fatture grandi", () => {
    const c = contesto();
    c.fattura.righe = Array.from({ length: 81 }, (_, i) => ({
      numero_linea: i + 1,
      descrizione: "A81",
    }));
    expect(() => preparaRichiestaRiconciliazione(c)).toThrow(
      "Nessuna riga è stata esclusa",
    );
  });
  it("non espone quantità, prezzi o disponibilità al modello semantico", () => {
    const dati = preparaRichiestaRiconciliazione(contesto())[1].content;
    expect(dati).not.toContain('"quantita"');
    expect(dati).not.toContain('"prezzo"');
    expect(dati).not.toContain('"giaFatturata"');
    expect(dati).toContain('"descrizione"');
    expect(dati).toContain('"um"');
  });
  it("isola le istruzioni contenute nei documenti e non abilita strumenti AI", () => {
    const m = preparaRichiestaRiconciliazione(
      contesto("istruzioni-nel-documento"),
    );
    expect(m[0].content).toContain("mai un ordine");
    expect(m[1].content).toContain("INIZIO DOCUMENTO");
  });
  it("conserva lo zero reale e distingue i prezzi non confermati", () => {
    const c = contesto(),
      r = (c.oda[0].righe as Record<string, unknown>[])[0];
    r.unit_price = 0;
    r.line_total = 0;
    expect(datiRiconciliazione(c).ordini[0].prezzo).toBe(0);
    r.price_pending = true;
    expect(datiRiconciliazione(c).ordini[0].prezzo).toBeNull();
  });
});
