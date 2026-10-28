import { describe, expect, it } from "vitest";
import {
  type ContestoQuadro,
  quadroDocumentale,
  riepilogoQuadro,
} from "@/lib/sicurezza/quadroDocumentale";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
import type { DocumentoSicurezza } from "@/lib/sicurezza/documentiSicurezza";
const c: ContestoQuadro = {
  companyId: "c",
  orderId: "o",
  oggi: "2026-10-27",
  operaiIds: ["w"],
  impreseIds: ["s"],
};
const e = (p: Partial<EvidenzaFascicolo> = {}): EvidenzaFascicolo => ({
  id: "e",
  company_id: "c",
  order_id: "o",
  subappaltatore_id: null,
  operaio_id: null,
  tipo: "psc",
  titolo: "PSC",
  origine_requisito: "interna",
  riferimento_requisito: "Caso",
  stato: "ricevuto",
  file_path: "c/file.pdf",
  file_name: "file.pdf",
  data_rilascio: null,
  data_scadenza: null,
  competenza: null,
  revisione: "01",
  termine: null,
  referente: null,
  verificato_da: null,
  verificato_il: null,
  note: null,
  updated_at: "2026-10-27",
  ...p,
});
const d = (p: Partial<DocumentoSicurezza> = {}): DocumentoSicurezza => ({
  id: "d",
  fonte: "sicurezza",
  order_id: "o",
  subappaltatore_id: null,
  tipo: "psc",
  titolo: "PSC archivio",
  file_path: "c/file",
  file_name: "a.pdf",
  data_documento: null,
  data_scadenza: null,
  note: null,
  created_at: "2026-10-27",
  ...p,
});
describe("Quadro documentale del caso", () => {
  it("non crea obblighi da un fascicolo vuoto", () => {
    expect(quadroDocumentale(c, [], [])).toEqual([]);
    expect(riepilogoQuadro([]).registrati).toBe(0);
  });
  it("esclude tenant, commesse e imprese estranei", () => {
    expect(
      quadroDocumentale(c, [
        e({ company_id: "altra" }),
        e({ id: "2", order_id: "altra" }),
        e({ id: "3", subappaltatore_id: "altra" }),
      ], []),
    ).toEqual([]);
  });
  it("non applica documenti personali di addetti non assegnati", () => {
    expect(
      quadroDocumentale(
        c,
        [e({ operaio_id: "altro", tipo: "formazione" })],
        [],
      ),
    ).toHaveLength(0);
    expect(
      quadroDocumentale(c, [e({ operaio_id: "w", tipo: "formazione" })], []),
    ).toHaveLength(1);
  });
  it("rispetta fase e periodo del requisito, distinto dalla scadenza", () => {
    expect(
      quadroDocumentale({ ...c, faseId: "fase" }, [
        e({ fase_id: "altra" }),
        e({ id: "2", applicabile_dal: "2026-11-01" }),
        e({ id: "3", applicabile_al: "2026-10-01" }),
      ], []),
    ).toHaveLength(0);
    expect(
      quadroDocumentale({ ...c, faseId: "fase" }, [e({ fase_id: "fase" })], []),
    ).toHaveLength(1);
  });
  it("non usa PSC/POS generici aziendali per il cantiere", () => {
    expect(
      quadroDocumentale(c, [
        e({ order_id: null }),
        e({ id: "pos", tipo: "pos", order_id: null }),
      ], [d({ order_id: null })]),
    ).toHaveLength(0);
  });
  it("riutilizza documenti generali della ditta collegata senza cambiare stato", () => {
    expect(
      quadroDocumentale(c, [
        e({ order_id: null, tipo: "visura", subappaltatore_id: "s" }),
      ], [])[0],
    ).toMatchObject({ stato: "da_verificare", subId: "s", ordineFonte: null });
  });
  it("non promuove un caricamento a verifica", () => {
    expect(quadroDocumentale(c, [e()], [])[0].stato).toBe("da_verificare");
    expect(
      quadroDocumentale(c, [], [d({ stato_verifica: "verificato" })])[0].stato,
    ).toBe("archivio");
  });
  it("richiede originale e registrazione della verifica", () => {
    expect(quadroDocumentale(c, [e({ stato: "verificato" })], [])[0].stato)
      .toBe("da_verificare");
    expect(
      quadroDocumentale(c, [e({ stato: "verificato", file_path: null })], [])[0]
        .stato,
    ).toBe("integrazione");
    expect(
      quadroDocumentale(c, [
        e({
          stato: "verificato",
          verificato_da: "u",
          verificato_il: "2026-10-27",
        }),
      ], [])[0].stato,
    ).toBe("verificato");
  });
  it("distingue richieste, integrazioni, scaduti e scadenze prossime", () => {
    expect(
      quadroDocumentale(c, [e({ stato: "richiesto", file_path: null })], [])[0]
        .stato,
    ).toBe("da_ricevere");
    expect(quadroDocumentale(c, [e({ stato: "integrazione" })], [])[0].stato)
      .toBe("integrazione");
    expect(
      quadroDocumentale(c, [e({ data_scadenza: "2026-10-26" })], [])[0].stato,
    ).toBe("scaduto");
    expect(
      quadroDocumentale(c, [
        e({
          stato: "verificato",
          verificato_da: "u",
          verificato_il: "2026-10-27",
          data_scadenza: "2026-11-01",
        }),
      ], [])[0].stato,
    ).toBe("in_scadenza");
  });
  it("non considera chiusa un’esclusione priva di motivazione", () => {
    expect(
      quadroDocumentale(c, [e({ stato: "non_applicabile", note: null })], [])[0]
        .stato,
    ).toBe("integrazione");
    expect(
      quadroDocumentale(c, [
        e({
          stato: "non_applicabile",
          note: "Escluso per il caso documentato",
        }),
      ], [])[0].stato,
    ).toBe("non_applicabile");
  });
  it("deduplica lo stesso record e lascia separata una copia di archivio", () => {
    const rows = quadroDocumentale(c, [e(), e()], [d(), d()]);
    expect(rows).toHaveLength(2);
    expect(riepilogoQuadro(rows)).toMatchObject({
      registrati: 1,
      archivio: 1,
      daVerificare: 1,
    });
  });
  it("esclude record superati e conversioni del fascicolo già rappresentate", () => {
    expect(
      quadroDocumentale(c, [e({ stato: "superato" })], [
        d({ fonte: "fascicolo_cantiere" }),
      ]),
    ).toHaveLength(0);
  });
});
