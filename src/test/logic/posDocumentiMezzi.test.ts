import { describe, expect, it } from "vitest";
import {
  CATEGORIE_DOCUMENTO_MEZZO_POS,
  normalizzaDocumentoMezzo,
  normalizzaControlliMezzo,
  normalizzaDocumentazioneMezzo,
  erroriDocumentazioneMezzo,
  avvisiControlliMezzo,
  supportaDocumentiMezziPos,
} from "../../../supabase/functions/_shared/posDocumentiMezzi";
import {
  documentoMezzoProva,
  controlliMezzoProva,
  documentazioneMezzoProva,
  idMezzoPos,
} from "../fixtures/posDocumentiMezzi";
import {
  normalizzaTecnicaPos,
  tecnicaPosRiutilizzabile,
} from "../../../supabase/functions/_shared/posTecnica";
const errori = (
  v = documentazioneMezzoProva(),
  mezzo: string | null = idMezzoPos,
) => erroriDocumentazioneMezzo(v, mezzo, "2026-11-02", "2026-11-20");
describe("Documenti della specifica attrezzatura POS", () => {
  it("la scelta iniziale non inventa documenti o riesame", () => {
    expect(normalizzaDocumentazioneMezzo(null)).toMatchObject({
      modalita: "da_verificare",
      documenti: [],
      controlli: null,
      confermata: false,
    });
    expect(errori(normalizzaDocumentazioneMezzo(null)).join()).toContain(
      "scegli e riesamina",
    );
  });
  it("proietta documenti e controlli senza costi, percorsi, descrizioni private o profili", () => {
    const d = normalizzaDocumentoMezzo({
      ...documentoMezzoProva(),
      file_path: "privato",
      importo: 1234,
      note: "PRIVATE",
    });
    const c = normalizzaControlliMezzo({
      ...controlliMezzoProva(),
      manutenzioni: [
        {
          ...controlliMezzoProva().manutenzioni[0],
          costo: 5678,
          descrizione: "PRIVATE",
          file_name: "fattura.pdf",
        },
      ],
      segnalazioni: [
        {
          id: "a",
          tipo: "guasto",
          stato: "aperta",
          hr_profilo_id: "PRIVATE",
          descrizione: "PRIVATE",
        },
      ],
    });
    expect(JSON.stringify([d, c])).not.toMatch(
      /privato|PRIVATE|1234|5678|fattura/,
    );
    expect(c.manutenzioni[0].contatore).toBe("10.5000");
  });
  it("esclude documenti economici e generici dalla selezione automatica", () => {
    expect(CATEGORIE_DOCUMENTO_MEZZO_POS).not.toContain("contratto");
    expect(CATEGORIE_DOCUMENTO_MEZZO_POS).not.toContain("assicurazione");
    expect(CATEGORIE_DOCUMENTO_MEZZO_POS).not.toContain("altro");
    const v = documentazioneMezzoProva();
    v.documenti[0].categoria = "contratto";
    expect(errori(v).join()).toContain("non pertinente");
  });
  it("accetta una selezione completa con i controlli della stessa macchina", () =>
    expect(errori()).toEqual([]));
  it("il nome o il titolo non autorizzano documenti di un’altra macchina", () => {
    const v = documentazioneMezzoProva();
    v.documenti[0].mezzo_id = "44444444-4444-4444-8444-444444444444";
    expect(errori(v).join()).toContain("specifica attrezzatura");
  });
  it("richiede identità d’inventario per selezionare originali nativi", () =>
    expect(errori(documentazioneMezzoProva(), null).join()).toContain(
      "collega prima",
    ));
  it.each(["revisione", "conferma", "originale"])(
    "non considera pronto un documento senza %s",
    (campo) => {
      const v = documentazioneMezzoProva();
      if (campo === "revisione") v.documenti[0].revisione_dichiarata = "";
      if (campo === "conferma") v.documenti[0].confermata = false;
      if (campo === "originale") v.documenti[0].disponibile = false;
      expect(errori(v).length).toBeGreaterThan(0);
    },
  );
  it("il documento deve coprire l’uso effettivo, inclusi gli estremi", () => {
    const v = documentazioneMezzoProva();
    v.documenti[0].data_inizio = "2026-11-02";
    v.documenti[0].data_scadenza = "2026-11-20";
    expect(errori(v)).toEqual([]);
    v.documenti[0].data_scadenza = "2026-11-19";
    expect(errori(v).join()).toContain("periodo d’uso");
  });
  it("non accetta controlli assenti o riferiti a un’altra macchina", () => {
    const v = documentazioneMezzoProva();
    v.controlli = null;
    expect(errori(v).join()).toContain("rileggi");
    v.controlli = { ...controlliMezzoProva(), mezzo_id: "altra" };
    expect(errori(v).join()).toContain("rileggi");
  });
  it("richiede riesame e conferma senza dedurli da un elenco vuoto", () => {
    const v = documentazioneMezzoProva();
    v.controlli!.manutenzioni = [];
    v.riesame_controlli = "";
    v.confermata = false;
    expect(errori(v).join()).toContain("descrivi il riesame");
    expect(errori(v).join()).toContain("conferma documenti");
  });
  it("altra gestione è una dichiarazione motivata, senza documenti nascosti", () => {
    const v = documentazioneMezzoProva();
    v.modalita = "altra_gestione";
    expect(errori(v).join()).toContain("motiva");
    expect(errori(v).join()).toContain("rimuovi i documenti");
    v.documenti = [];
    v.motivazione = "TEST documenti nel fascicolo, riferimenti da controllare";
    expect(errori(v)).toEqual([]);
  });
  it("una macchina non censita non eredita controlli di inventario", () => {
    const v = documentazioneMezzoProva();
    v.modalita = "altra_gestione";
    v.motivazione = "TEST titolare esterno da verificare";
    v.documenti = [];
    expect(errori(v, null).join()).toContain("rimuovi i controlli");
    v.controlli = null;
    expect(errori(v, null)).toEqual([]);
  });
  it("segnala fatti su date, contatori e segnalazioni, senza un verdetto automatico", () => {
    const q = controlliMezzoProva();
    q.segnalazioni = [
      {
        id: "s",
        tipo: "guasto",
        stato: "aperta",
        creata_il: "2026-10-01",
        chiusa_il: null,
      },
    ];
    const avvisi = avvisiControlliMezzo(q, "2026-12-02", "100");
    expect(avvisi).toHaveLength(3);
    expect(avvisi.join()).not.toMatch(/idonea|autorizzata|conforme/);
    expect(
      avvisiControlliMezzo({ ...q, segnalazioni: [] }, "2026-12-01", null),
    ).toEqual([]);
  });
  it("duplicazione e standard rimuovono fonti, controlli e conferme del vecchio cantiere", () => {
    const t = normalizzaTecnicaPos({
      attrezzature: [{ id: "a", documentazione: documentazioneMezzoProva() }],
    });
    expect(tecnicaPosRiutilizzabile(t).attrezzature[0].documentazione).toEqual(
      normalizzaDocumentazioneMezzo(null),
    );
    expect(t.attrezzature[0].documentazione!.documenti).toHaveLength(1);
  });
  it("adotta il protocollo soltanto da un client che supporta identità e documenti", () => {
    expect(
      supportaDocumentiMezziPos({
        versione_client: 2,
        versione_tecnica_client: 1,
        versione_mezzi_client: 1,
      }),
    ).toBe(false);
    expect(
      supportaDocumentiMezziPos({
        versione_client: 2,
        versione_tecnica_client: 1,
        versione_mezzi_client: 1,
        versione_documenti_mezzi_client: 1,
      }),
    ).toBe(true);
  });
});
