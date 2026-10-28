import { describe, expect, it } from "vitest";
import {
  avvisiProdottoSds,
  documentiSdsPertinenti,
  erroriProdottoSds,
  datiProdottoSds,
  vuotoProdottoSds,
  type ImpiegoProdottoSds,
  type DocumentoSds,
} from "@/lib/sicurezza/prodottiSds";
const doc = (patch: Partial<DocumentoSds> = {}): DocumentoSds => ({
  id: "e1",
  subappaltatore_id: null,
  order_id: "ordine",
  fase_id: null,
  titolo: "SDS A",
  file_name: "a.pdf",
  revisione: "1.0",
  data_rilascio: "2026-10-01",
  data_scadenza: null,
  stato: "verificato",
  applicabile_dal: null,
  applicabile_al: null,
  updated_at: "2026-10-27T10:00:00.123456Z",
  disponibile: true,
  impronta: "h1",
  ...patch,
});
const prodotto = (
  patch: Partial<ImpiegoProdottoSds> = {},
): ImpiegoProdottoSds => ({
  ...vuotoProdottoSds("2026-10-27"),
  id: "p1",
  company_id: "azienda",
  order_id: "ordine",
  versione: 2,
  aggiornato_il: "2026-10-27T11:00:00Z",
  al: null,
  nome: "Sigillante A",
  produttore: "Fabbricante",
  codice: "A",
  impiego: "Sigillatura giunti",
  sds_necessaria: "si",
  evidenza_id: "e1",
  evidenza_impronta: "h1",
  evidenza_snapshot: doc(),
  materiale_snapshot: null,
  materiale_corrente: null,
  documento_corrente: doc(),
  materiale_cambiato: false,
  documento_cambiato: false,
  pertinente: true,
  documento_pertinente: true,
  corrispondenza_confermata: true,
  ...patch,
});
describe("SDS per prodotto, senza copertura generica", () => {
  it("una SDS del primo prodotto non copre il secondo", () => {
    expect(avvisiProdottoSds(prodotto(), "2026-10-27")).toEqual([]);
    expect(
      avvisiProdottoSds(
        prodotto({
          id: "p2",
          evidenza_id: null,
          documento_corrente: null,
          documento_pertinente: false,
        }),
        "2026-10-27",
      ),
    ).toContain("SDS mancante per questo prodotto");
  });
  it("filtra titolare, fase, periodo, file e stato senza scartare una scadenza da esaminare", () => {
    const docs = [
      doc(),
      doc({ id: "sub", subappaltatore_id: "sub" }),
      doc({ id: "fase", fase_id: "altra" }),
      doc({ id: "periodo", applicabile_dal: "2026-11-01" }),
      doc({ id: "file", disponibile: false }),
      doc({ id: "superato", stato: "superato" }),
      doc({ id: "nonapp", stato: "non_applicabile" }),
      doc({ id: "scaduto", data_scadenza: "2026-10-01" }),
    ];
    expect(
      documentiSdsPertinenti(
        docs,
        { subappaltatore_id: null, fase_id: "fase" },
        "2026-10-27",
      ).map((e) => e.id),
    ).toEqual(["e1", "scaduto"]);
  });
  it("non considera verificata una SDS ricevuta, incompleta o cambiata", () => {
    const a = avvisiProdottoSds(
      prodotto({
        documento_cambiato: true,
        corrispondenza_confermata: false,
        documento_corrente: doc({
          stato: "ricevuto",
          revisione: null,
          data_rilascio: null,
          data_scadenza: "2026-10-20",
        }),
      }),
      "2026-10-27",
    );
    expect(a).toHaveLength(5);
    expect(a.join(" ")).toContain("SDS cambiata");
    expect(a.join(" ")).toContain("Data di scadenza documentale superata");
  });
  it("non inventa una scadenza dalla data di rilascio", () => {
    expect(
      avvisiProdottoSds(
        prodotto({ documento_corrente: doc({ data_rilascio: "2000-01-01" }) }),
        "2026-10-27",
      ),
    ).toEqual([]);
  });
  it("distingue fonte cambiata, rimossa, annullamento e necessità da valutare", () => {
    expect(
      avvisiProdottoSds(prodotto({ materiale_cambiato: true }), "2026-10-27"),
    ).toContain("Materiale di origine rimosso o non disponibile");
    expect(
      avvisiProdottoSds(
        prodotto({ sds_necessaria: "da_valutare" }),
        "2026-10-27",
      ),
    ).toContain("Necessità della SDS da valutare");
    expect(
      avvisiProdottoSds(
        prodotto({ annullato: true, documento_cambiato: true }),
        "2026-10-27",
      ),
    ).toEqual(["Registrazione annullata"]);
  });
  it("non eredita la motivazione di rettifica ma conserva le versioni lette delle fonti", () => {
    const d = datiProdottoSds(prodotto());
    expect(d.motivo).toBe("");
    expect(d.evidenza_impronta).toBe("h1");
    expect(d.al).toBe("");
    expect(d).not.toHaveProperty("versione");
  });
  it("valida date impossibili, motivazione e mancata necessità senza obbligare file a prodotti ancora da valutare", () => {
    const d = {
      ...vuotoProdottoSds("2026-10-27"),
      nome: "Prodotto",
      impiego: "Posa",
      motivo: "Prima registrazione",
    };
    expect(erroriProdottoSds(d)).toEqual([]);
    expect(erroriProdottoSds({ ...d, dal: "2026-02-30" }).join(" ")).toContain(
      "data",
    );
    expect(
      erroriProdottoSds({ ...d, sds_necessaria: "no" }).join(" "),
    ).toContain("Motiva");
    expect(
      erroriProdottoSds({ ...d, corrispondenza_confermata: true }).join(" "),
    ).toContain("Collega");
  });
});
