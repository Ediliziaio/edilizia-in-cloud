import { describe, it, expect } from "vitest";
import {
  erroreVerificaItp,
  avvisiVerificaItp,
  ultimaVerificaItp,
  type DatiVerificaItp,
  type VerificaItp,
} from "@/lib/sicurezza/itp";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
const contesto = {
  impresa: {
    id: "sub",
    ragione_sociale: "Impresa",
    campo_subappaltatore_id: null,
  },
  commessa: { id: "ordine", order_code: "ORD", description: null },
  fase: null,
};
const dati = (): DatiVerificaItp => ({
  fase_id: null,
  dal: "2026-11-01",
  al: null,
  esito: "positivo",
  attivita: "Lavori",
  responsabile: "Responsabile",
  ruolo_responsabile: "Ruolo",
  motivazione: "Valutazione",
  completezza: true,
  criteri: [
    {
      id: "c",
      titolo: "Criterio",
      catalogo_id: null,
      catalogo_versione: null,
      applicabilita: "applicabile",
      esito: "conforme",
      riferimento: "Riferimento",
      note: "",
      evidenze: ["e"],
    },
  ],
  contesto_atteso: contesto,
  evidenze_attese: { e: "2026-10-27" },
});
const fonte = {
  id: "e",
  titolo: "DURC",
  tipo: "durc",
  stato: "verificato",
  file_path: "file",
  updated_at: "2026-10-27",
  data_scadenza: "2026-11-10",
} as EvidenzaFascicolo;
const verifica = (patch: Partial<VerificaItp> = {}): VerificaItp => ({
  ...dati(),
  id: "v",
  company_id: "azienda",
  order_id: "ordine",
  subappaltatore_id: "sub",
  versione: 1,
  precedente_id: null,
  contesto,
  evidenze: [fonte],
  registrato_da: "utente",
  registrato_da_nome: "Utente",
  registrato_il: "2026-10-27",
  ...patch,
});
describe("Registrazioni ITP attribuite e limitate al contesto", () => {
  it("non deduce un esito positivo dalla presenza di un file", () => {
    const d = dati();
    d.criteri[0].applicabilita = "da_chiarire";
    expect(erroreVerificaItp(d)).toContain("criteri definiti");
    d.criteri[0].applicabilita = "applicabile";
    d.criteri[0].evidenze = [];
    expect(erroreVerificaItp(d)).toContain("evidenze verificate");
  });
  it("richiede attestazione complessiva e un responsabile", () => {
    const d = dati();
    d.completezza = false;
    expect(erroreVerificaItp(d)).toContain("Conferma");
    d.completezza = true;
    d.responsabile = " ";
    expect(erroreVerificaItp(d)).toContain("responsabile");
  });
  it("non accetta NA o negativo senza criteri coerenti e motivati", () => {
    const d = dati();
    d.esito = "non_applicabile";
    expect(erroreVerificaItp(d)).toBeTruthy();
    d.criteri[0].applicabilita = "non_applicabile";
    d.criteri[0].esito = "non_applicabile";
    expect(erroreVerificaItp(d)).toContain("Motiva");
    d.criteri[0].note = "Motivazione";
    expect(erroreVerificaItp(d)).toBeNull();
    d.esito = "negativo";
    expect(erroreVerificaItp(d)).toContain("non conforme");
  });
  it("la rettifica non resuscita il precedente esito positivo", () => {
    const v = verifica();
    const ann = verifica({
      id: "ann",
      versione: 2,
      esito: "annullata",
      precedente_id: "v",
    });
    expect(ultimaVerificaItp([v, ann], "sub", "2026-11-05")?.esito).toBe(
      "annullata",
    );
  });
  it("non usa una valutazione di un’altra fase o periodo", () => {
    const v = verifica({ fase_id: "fase-a", al: "2026-11-10" });
    expect(
      ultimaVerificaItp([v], "sub", "2026-11-05", "fase-b"),
    ).toBeUndefined();
    expect(
      ultimaVerificaItp([v], "sub", "2026-11-11", "fase-a"),
    ).toBeUndefined();
  });
  it("un esito passato resta visibile ma segnala fonti cambiate o scadute", () => {
    const v = verifica();
    expect(avvisiVerificaItp(v, [fonte], contesto, "2026-11-01")).toEqual([]);
    expect(
      avvisiVerificaItp(
        v,
        [{ ...fonte, updated_at: "diversa" }],
        contesto,
        "2026-11-11",
      ).join(" "),
    ).toMatch(/cambiata.*scaduta/);
    expect(avvisiVerificaItp(v, [], contesto, "2026-11-01")[0]).toContain(
      "non più disponibile",
    );
  });
  it("segnala ripianificazione e DURC senza scadenza registrata", () => {
    const v = verifica({
      contesto: {
        ...contesto,
        fase: {
          id: "fase",
          name: "Posa",
          start_date: "2026-11-01",
          end_date: null,
        },
      },
    });
    const avvisi = avvisiVerificaItp(
      v,
      [{ ...fonte, data_scadenza: null }],
      {
        ...v.contesto,
        fase: { ...v.contesto.fase!, start_date: "2026-12-01" },
      },
      "2026-11-01",
    );
    expect(avvisi.join(" ")).toMatch(/pianificazione.*DURC/);
  });
});
