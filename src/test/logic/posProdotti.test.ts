import { describe, expect, it } from "vitest";
import {
  posVuoto,
  lavorazioneVuota,
  normalizzaPos,
  vociMancanti,
} from "../../../supabase/functions/_shared/posModello";
import {
  supportaProdottiPos,
  normalizzaProdottoPos,
  erroriProdottoPos,
  invalidaProdottiLavorazione,
} from "../../../supabase/functions/_shared/posProdotti";
import { lavorazioniRiutilizzabili } from "../../../supabase/functions/_shared/posRiuso";
const foto = () =>
  normalizzaProdottoPos({
    impiego_id: "prodotto1",
    versione: 2,
    nome: "Sigillante A",
    impiego: "Sigillatura",
    fase_id: "fase1",
    subappaltatore_id: null,
    dal: "2026-10-01",
    al: "2026-11-30",
    sds_necessaria: "si",
    evidenza_id: "sds1",
    evidenza_impronta: "hash",
    sds_revisione: "1.0",
    sds_data: "2026-10-01",
    sds_stato: "verificato",
    sds_file_name: "a.pdf",
    corrispondenza_confermata: true,
    verificato: true,
  });
const pos = () => {
  const p = posVuoto();
  p.versione_prodotti = 1;
  p.lavorazioni = [
    {
      ...lavorazioneVuota("l1"),
      titolo: "Posa",
      sostanze: "Sigillante",
      fase_id: "fase1",
      prodotti: [],
      prodotti_riesaminati: true,
    },
  ];
  return p;
};
describe("Prodotti e SDS per ogni lavorazione POS", () => {
  it("richiede una capacità prodotti distinta dai vecchi editor v2",()=>{
    expect(supportaProdottiPos({versione_client:2})).toBe(false);
    expect(supportaProdottiPos({versione_client:2,versione_prodotti_client:"1"})).toBe(false);
    expect(supportaProdottiPos({versione_client:1,versione_prodotti_client:1})).toBe(false);
    expect(supportaProdottiPos({versione_client:2,versione_prodotti_client:1})).toBe(true);
  });

  it("una SDS generica allegata non copre un prodotto non identificato", () => {
    const p = pos();
    p.allegati = [
      { tipo: "scheda_sicurezza", nome: "Generica", file_path: "a.pdf" },
    ];
    expect(
      vociMancanti(p).some((v) =>
        v.testo.includes("identifica i singoli prodotti"),
      ),
    ).toBe(true);
  });
  it("il riesame resta richiesto anche se le sostanze sono dichiarate assenti", () => {
    const p = pos();
    p.lavorazioni[0].sostanze = "Nessuna";
    p.lavorazioni[0].prodotti_riesaminati = false;
    expect(
      vociMancanti(p).some((v) => v.testo.includes("riesamina l’elenco")),
    ).toBe(true);
  });
  it("il prodotto riesaminato soddisfa soltanto la sua associazione, non quella di un’altra scheda", () => {
    const p = pos();
    p.lavorazioni[0].prodotti = [foto()];
    p.lavorazioni.push({
      ...lavorazioneVuota("l2"),
      titolo: "Altra posa",
      sostanze: "Sigillante",
      prodotti_riesaminati: true,
    });
    const e = vociMancanti(p).filter((v) =>
      v.testo.includes("singoli prodotti"),
    );
    expect(e).toHaveLength(1);
    expect(e[0].testo).toContain("Altra posa");
  });
  it("controlla conferma, revisione, impresa e fase senza dedurle dal nome", () => {
    const p = foto();
    expect(erroriProdottoPos(p, "fase1")).toEqual([]);
    expect(
      erroriProdottoPos(
        {
          ...p,
          verificato: false,
          subappaltatore_id: "sub",
          sds_revisione: null,
        },
        "fase2",
      ),
    ).toHaveLength(4);
  });
  it("una necessità esclusa richiede motivazione, quella ignota resta da valutare", () => {
    expect(
      erroriProdottoPos(
        { ...foto(), sds_necessaria: "no", motivo_non_necessaria: null },
        "fase1",
      ),
    ).toContain("necessità esclusa senza motivazione");
    expect(
      erroriProdottoPos({ ...foto(), sds_necessaria: "da_valutare" }, "fase1"),
    ).toContain("necessità della SDS da valutare");
  });
  it("dichiarare nessuna sostanza contraddice un prodotto con SDS richiesta", () => {
    const p = pos();
    p.lavorazioni[0].sostanze = "Nessuna";
    p.lavorazioni[0].prodotti = [foto()];
    expect(
      vociMancanti(p).some((v) =>
        v.testo.includes("sostanze dichiarate assenti"),
      ),
    ).toBe(true);
  });
  it("non trasporta percorsi e campi arbitrari nelle fotografie normalizzate", () => {
    const p = foto();
    const d = normalizzaProdottoPos({
      ...p,
      file_path: "segreto",
      bucket: "altro",
      registrato_da: "client",
    });
    expect(d).not.toHaveProperty("file_path");
    expect(d).not.toHaveProperty("bucket");
    const c = pos();
    c.lavorazioni[0].prodotti = [d];
    expect(normalizzaPos(c).lavorazioni[0].prodotti?.[0]).toEqual(d);
  });
  it("le modifiche revocano il riesame senza cambiare la fonte fotografata", () => {
    const l = { prodotti: [foto()], prodotti_riesaminati: true };
    invalidaProdottiLavorazione(l);
    expect(l.prodotti_riesaminati).toBe(false);
    expect(l.prodotti[0]).toMatchObject({
      versione: 2,
      evidenza_impronta: "hash",
      verificato: false,
    });
  });
  it("modelli e duplicazioni tra commesse escludono impieghi e fasi del vecchio cantiere", () => {
    const p = pos();
    p.lavorazioni[0].prodotti = [foto()];
    const l = lavorazioniRiutilizzabili(p)[0];
    expect(l.prodotti).toBeUndefined();
    expect(l.fase_id).toBeUndefined();
    expect(l.verificata).toBe(false);
  });
  it("i controlli storici senza protocollo prodotti conservano il comportamento precedente", () => {
    const p = pos();
    delete p.versione_prodotti;
    p.allegati = [
      { tipo: "scheda_sicurezza", nome: "Storica", file_path: "a.pdf" },
    ];
    expect(
      vociMancanti(p).some((v) => v.testo.includes("singoli prodotti")),
    ).toBe(false);
    expect(normalizzaPos(p).versione_prodotti).toBeUndefined();
  });
});
