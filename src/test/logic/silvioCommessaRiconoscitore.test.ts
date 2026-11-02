/**
 * Il riconoscitore e il modulo client (fase 1, lotto 1.2), più la decisione rimasta aperta
 * dalla fase 1A: le fasi senza durate prendono quelle del modello come proposta, senza conflitto.
 */
import { describe, expect, it, vi } from "vitest";
import { riconosciDocumento } from "../../../shared/silvio-commessa/riconoscitore.ts";
import { durateDalModello, fasiDelModello } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import { fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import type { FaseDelPiano, Frammento } from "../../../shared/silvio-commessa/piano.ts";
import { valutaFile, BUCKET_SILVIO_COMMESSA } from "../../../supabase/functions/_shared/storageAmmesso";
import {
  conModelloSeMancanoLeFasi, leggiDocumento, leggiTesto, nomePerLoStorage, percorsoDocumento, type ServiziLettura,
} from "@/lib/silvio-commessa/leggiDocumento";
import { frammentoDaPreventivo } from "@/lib/silvio-commessa/lettori";
import type { ComputoStrutturato } from "@/lib/computo/computoStrutturato";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "1dbe6ceb-6b04-4d43-a617-8a709cb22f07";

const RIGHE_PRIMUS = "COMPUTO METRICO ESTIMATIVO\nNum.Ord.\tTARIFFA\tDESIGNAZIONE DEI LAVORI\tQuantità\n1\t01.A01\tScavo\nSOMMANO m³\t12,00";

describe("riconoscitore", () => {
  it("computi: XPWE dal nome o dall'inizio, PDF di PriMus dalle intestazioni, senza AI", () => {
    expect(riconosciDocumento({ nome: "Computo.xpwe" })).toMatchObject({ lettore: "computo_xpwe", ai: false, fonte: "computo" });
    expect(riconosciDocumento({ nome: "esportato.xml", inizio: "<?xml version='1.0'?><PweDocumento>" }).lettore).toBe("computo_xpwe");
    expect(riconosciDocumento({ nome: "vecchio.dcf" }).lettore).toBe("computo_xpwe");
    expect(riconosciDocumento({ nome: "computo.pdf", mime: "application/pdf", inizio: RIGHE_PRIMUS })).toMatchObject({ lettore: "computo_primus", ai: false });
  });

  it("un PDF che dice «computo» ma non ha le colonne di PriMus va a Silvio", () => {
    expect(riconosciDocumento({ nome: "computo.pdf", inizio: "Computo dei lavori del bagno: totale 8.000 euro" }).lettore).toBe("silvio_commessa");
  });

  it("offerte delle ditte: dal nome o dalle prime righe", () => {
    expect(riconosciDocumento({ nome: "Offerta_Ponteggi_Rossi.pdf" })).toMatchObject({ lettore: "offerta_ditta", fonte: "offerta" });
    expect(riconosciDocumento({ nome: "doc123.pdf", inizio: "Spett.le Impresa\nIn riferimento alla Vs. richiesta, la nostra offerta…\nValidità dell'offerta: 30 giorni" }).lettore)
      .toBe("offerta_ditta");
    expect(riconosciDocumento({ nome: "IMG_2041.jpg", mime: "image/jpeg", inizio: "" }).lettore).toBe("silvio_commessa");
  });

  it("contratto, capitolato e documenti qualsiasi vanno al lettore unico, col tipo di fonte giusto", () => {
    expect(riconosciDocumento({ nome: "Contratto Rossi.pdf" })).toMatchObject({ lettore: "silvio_commessa", fonte: "contratto", ai: true });
    expect(riconosciDocumento({ nome: "scansione.pdf", inizio: "SCRITTURA PRIVATA PER LAVORI EDILI\nIl committente…" }).fonte).toBe("contratto");
    // Un contratto che nomina l'offerta resta un contratto.
    expect(riconosciDocumento({ nome: "a.pdf", inizio: "CONTRATTO D'APPALTO\nL'offerta n. 12 dell'appaltatore è parte del contratto" }).fonte).toBe("contratto");
    // Un capitolato speciale d'appalto nomina il contratto, ma è un capitolato.
    const cap = riconosciDocumento({ nome: "b.pdf", inizio: "CAPITOLATO SPECIALE D'APPALTO\nIl presente capitolato fa parte del contratto" });
    expect(cap).toMatchObject({ lettore: "silvio_commessa", fonte: "documento", motivo: expect.stringMatching(/capitolato/) });
    expect(riconosciDocumento({ nome: "relazione.pdf", inizio: "RELAZIONE TECNICA" }).fonte).toBe("documento");
    expect(riconosciDocumento({ nome: "note.txt", mime: "text/plain" }).fonte).toBe("testo");
  });

  it("foto e piantine con la visione", () => {
    expect(riconosciDocumento({ nome: "cantiere.jpg", mime: "image/jpeg" })).toMatchObject({ lettore: "silvio_commessa", immagine: true, motivo: expect.stringMatching(/foto/) });
    expect(riconosciDocumento({ nome: "Piantina piano terra.png" })).toMatchObject({ immagine: true, motivo: expect.stringMatching(/piantina/) });
  });

  it("i formati che non si leggono lo dicono subito, senza spendere crediti", () => {
    for (const nome of ["preventivo.docx", "foglio.xlsx", "tavola.dwg", "foto.heic", "video.mp4"]) {
      expect(riconosciDocumento({ nome }), nome).toMatchObject({ lettore: "non_letto", ai: false });
    }
    expect(riconosciDocumento({ nome: "foto", mime: "image/heic" }).lettore).toBe("non_letto");
    expect(riconosciDocumento({ nome: "computo.xlsx" }).motivo).toMatch(/Importa computo/);
  });
});

// ── Il modulo client, con servizi finti ──

function servizi(over: Partial<ServiziLettura> = {}) {
  const caricati: string[] = [];
  const invocate: Array<{ funzione: string; body: Record<string, unknown> }> = [];
  const frammentoAI: Frammento = {
    fonte: { tipo: "documento", etichetta: "x" },
    aree: { identita: { "identita.description": { valore: "Rifacimento bagno 6 mq", fiducia: 0.9, stato: "fatto" } } },
    avvisi: [], costoEur: 0.004,
  };
  const s: ServiziLettura = {
    carica: vi.fn(async (percorso: string) => { caricati.push(percorso); }),
    invoca: vi.fn(async (funzione: string, body: Record<string, unknown>) => {
      invocate.push({ funzione, body });
      return funzione === "silvio-commessa" ? { ok: true, frammento: frammentoAI } : { ok: true, righe: [] };
    }),
    leggiComputo: vi.fn(async (): Promise<ComputoStrutturato> => { throw new Error("Questo PDF non è un computo stampato da PriMus."); }),
    primeRighe: vi.fn(async () => ""),
    ...over,
  };
  return { s, caricati, invocate };
}

const OPZ = { companyId: AZIENDA, userId: UTENTE, inizio: "2027-03-08" };
const file = (nome: string, tipo: string, corpo = "x") => new File([corpo], nome, { type: tipo });

describe("leggiDocumento", () => {
  it("il percorso sta nella cartella che la policy di silvio-uploads concede, e la funzione lo accetta", () => {
    const p = percorsoDocumento(OPZ, "Contratto d'appalto (firmato) 100%.pdf", 1730300000000);
    expect(p).toBe(`${AZIENDA}/${UTENTE}/commessa-1730300000000-Contratto_d_appalto_firmato_100_.pdf`);
    expect(valutaFile({ bucket: "silvio-uploads", path: p }, BUCKET_SILVIO_COMMESSA, { companyId: AZIENDA, userId: UTENTE }))
      .toEqual({ ok: true, conChiaveDiServizio: true });
    expect(nomePerLoStorage("../../%2e%2e?#.pdf")).not.toMatch(/[%?#/]|\.\./);
  });

  it("un contratto: si carica, lo legge silvio-commessa come contratto; senza fasi arriva il modello del bagno", async () => {
    const { s, caricati, invocate } = servizi();
    const esito = await leggiDocumento(file("Contratto Rossi.pdf", "application/pdf"), OPZ, s);
    expect(esito.riconosciuto.lettore).toBe("silvio_commessa");
    expect(caricati).toHaveLength(1);
    expect(invocate).toEqual([{ funzione: "silvio-commessa", body: {
      company_id: AZIENDA, tentativo: 0, fonte: { tipo: "contratto", etichetta: "Contratto Rossi.pdf" }, file_path: caricati[0],
    } }]);
    expect(esito.frammenti.map((f) => f.fonte.tipo)).toEqual(["documento", "modello"]);
    // Il modello ha la misura dal testo e le date dall'inizio.
    expect(esito.frammenti[1].fonte.etichetta).toBe("modello «bagno» (6 mq)");
    expect((esito.frammenti[1].aree.fasi!["fasi.order_work_phases"].valore as FaseDelPiano[])[0].start_date).toBe("2027-03-08");
  });

  it("un computo di PriMus si legge nel browser, senza caricare niente e senza AI", async () => {
    const computo: ComputoStrutturato = {
      formato: "primus_pdf", metadata: { oggetto_lavori: "Rifacimento bagno" }, totale_dichiarato: 600,
      voci: [{
        numero_ordine: "1", codici: ["01.A01"], codice_tariffa: "01.A01", descrizione: "Demolizione di rivestimenti", descrizione_troncata: false,
        unita_misura: "m²", quantita: 20, prezzo_unitario: 30, importo: 600, sezione: null, super_categoria: null, categoria: null,
        sotto_categoria: null, is_sicurezza: false, is_detrazione: false, a_corpo: false, misure: [], pagina: 1, avvisi: [],
      }],
      riepiloghi: [], prezzari: [], avvisi: [],
    };
    const { s, caricati, invocate } = servizi({ primeRighe: async () => RIGHE_PRIMUS, leggiComputo: vi.fn(async () => computo) });
    const esito = await leggiDocumento(file("computo.pdf", "application/pdf"), OPZ, s);
    expect(esito.riconosciuto.lettore).toBe("computo_primus");
    expect(esito.frammenti.map((f) => f.fonte)).toEqual([expect.objectContaining({ tipo: "computo", etichetta: "computo.pdf" })]);
    expect(caricati).toEqual([]);
    expect(invocate).toEqual([]);
  });

  it("sembrava PriMus e non lo è: ripiega sul lettore unico", async () => {
    const { s, invocate } = servizi({ primeRighe: async () => RIGHE_PRIMUS });
    const esito = await leggiDocumento(file("computo.pdf", "application/pdf"), OPZ, s);
    expect(esito.riconosciuto).toMatchObject({ lettore: "silvio_commessa", fonte: "documento" });
    expect(invocate.map((i) => i.funzione)).toEqual(["silvio-commessa"]);
  });

  it("l'offerta di una ditta: senza la richiesta d'offerta non si legge, con la richiesta va a rdo-ai-estrai-offerta", async () => {
    const { s, invocate, caricati } = servizi();
    const senza = await leggiDocumento(file("Offerta ponteggi.pdf", "application/pdf"), OPZ, s);
    expect(senza).toMatchObject({ frammenti: [], daCollegare: "richiesta_offerta" });
    expect(invocate).toEqual([]);
    const con = await leggiDocumento(file("Offerta ponteggi.pdf", "application/pdf", "%PDF"), { ...OPZ, rfqSupplierId: "rs-1" }, s);
    expect(invocate).toEqual([{ funzione: "rdo-ai-estrai-offerta", body: { rfq_supplier_id: "rs-1", document_base64: btoa("%PDF") } }]);
    expect(con.offerta).toEqual({ ok: true, righe: [] });
    expect(caricati).toEqual([]);
  });

  it("formato non letto: errore col motivo, niente caricato", async () => {
    const { s, caricati } = servizi();
    await expect(leggiDocumento(file("preventivo.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), OPZ, s))
      .rejects.toThrow(/formato non letto/);
    expect(caricati).toEqual([]);
  });

  it("il testo libero; se la lettura AI non riesce resta il modello, gratis", async () => {
    const { s, invocate } = servizi();
    const esito = await leggiTesto("rifare bagno 6 mq a Monza, 12k", OPZ, s);
    expect(invocate[0]).toMatchObject({ funzione: "silvio-commessa", body: { testo: "rifare bagno 6 mq a Monza, 12k", fonte: { tipo: "testo" } } });
    expect(esito.frammenti).toHaveLength(2);

    const guasto = servizi({ invoca: vi.fn(async () => { throw new Error("Crediti AI esauriti"); }) });
    const ripiego = await leggiTesto("rifare bagno 6 mq a Monza, 12k", OPZ, guasto.s);
    expect(ripiego.riconosciuto.ai).toBe(false);
    expect(ripiego.frammenti.map((f) => f.fonte.tipo)).toEqual(["modello"]);
    expect(ripiego.frammenti[0].avvisi?.join(" ")).toMatch(/Crediti AI esauriti/);
    await expect(leggiTesto("ciao", OPZ, guasto.s)).rejects.toThrow(/Crediti/);
  });

  it("il modello non ripete il tipo di lavoro che il documento dice già, e non arriva se le fasi ci sono", () => {
    const base: Frammento = {
      fonte: { tipo: "contratto", etichetta: "c" },
      aree: {
        identita: {
          "identita.description": { valore: "Rifacimento copertura 200 mq", fiducia: 0.9, stato: "fatto" },
          "identita.tipo_lavoro": { valore: "tetti", fiducia: 0.9, stato: "fatto" },
        },
      },
    };
    const [, modello] = conModelloSeMancanoLeFasi(base);
    expect(modello.aree.identita).toBeUndefined();
    expect(modello.aree.fasi?.["fasi.order_work_phases"]).toBeDefined();
    const conFasi = { ...base, aree: { ...base.aree, fasi: { "fasi.order_work_phases": { valore: [{ name: "Unica" }], fiducia: 0.9, stato: "fatto" as const } } } };
    expect(conModelloSeMancanoLeFasi(conFasi)).toHaveLength(1);
  });
});

describe("fasi con i nomi ma senza tempi: le durate del modello come proposta (decisione della fase 1A)", () => {
  it("le fasi simili a quelle del modello ne prendono la durata, le altre si dividono il resto", () => {
    const { fasi, completate } = durateDalModello(
      [{ name: "Demolizione del vecchio bagno" }, { name: "Posa pavimenti e rivestimenti" }, { name: "Varie" }, { name: "Collaudo", giorni: 1, giorno_inizio: 20 }],
      "bagno", 6,
    );
    const modello = fasiDelModello("bagno", 6);
    expect(fasi[0]).toEqual({ name: "Demolizione del vecchio bagno", giorni: modello[0].giorni, giorno_inizio: 1 });
    expect(fasi[1]).toMatchObject({ giorni: modello[3].giorni, giorno_inizio: 1 + modello[0].giorni! });
    expect(fasi[2].giorni).toBeGreaterThanOrEqual(1);
    // La fase che i tempi li aveva non si tocca.
    expect(fasi[3]).toEqual({ name: "Collaudo", giorni: 1, giorno_inizio: 20 });
    expect(completate).toEqual(["Demolizione del vecchio bagno", "Posa pavimenti e rivestimenti", "Varie"]);
  });

  it("fasi che hanno già tutte le durate: niente da fare", () => {
    const fasi: FaseDelPiano[] = [{ name: "A", giorni: 2, giorno_inizio: 1 }];
    expect(durateDalModello(fasi, "tetto")).toEqual({ fasi, completate: [] });
  });

  it("preventivo senza cronoprogramma ma col tipo di lavoro: le lavorazioni hanno le durate del modello, come proposta", () => {
    const fr = frammentoDaPreventivo({
      quote: { id: "q-b", quote_number: "PR-0201", status: "accettato", title: "Rifacimento bagno 8 mq", subtotal: 9000, vat_amount: 900, total: 9900 },
      righe: [
        { item_type: "service", item_category: "posa", name: "Demolizione rivestimenti", quantity: 1, unit_price: 2000 },
        { item_type: "service", item_category: "posa", name: "Impianto idrico ed elettrico", quantity: 1, unit_price: 3000 },
        { item_type: "service", item_category: "posa", name: "Posa piastrelle", quantity: 1, unit_price: 4000 },
      ],
      inizio: "2027-03-08",
    });
    const fasi = fr.aree.fasi!["fasi.order_work_phases"];
    expect(fasi.stato).toBe("proposta");
    expect(fasi.fiducia).toBeLessThanOrEqual(0.5);
    expect(fasi.nota).toMatch(/durate del modello del bagno/);
    const elenco = fasi.valore as FaseDelPiano[];
    expect(elenco.map((f) => f.name)).toEqual(["Demolizione rivestimenti", "Impianto idrico ed elettrico", "Posa piastrelle"]);
    expect(elenco.every((f) => f.giorni && f.giorno_inizio && f.start_date && f.end_date)).toBe(true);
    expect(elenco[0].start_date).toBe("2027-03-08");
    expect(fr.aree.fasi!["fasi.work_end_date"]).toBeDefined();
    expect(fr.avvisi?.join(" ")).toMatch(/con le durate del modello del bagno/);

    // Le fasi ci sono: il frammento del modello non serve più (leggiFrammentiPreventivo lo aggiunge solo
    // senza fasi), quindi nessun secondo elenco e nessun conflitto da risolvere.
    expect(conModelloSeMancanoLeFasi(fr)).toEqual([fr]);
    expect(fondi(pianoVuoto("azienda"), fr).conflitti).toEqual([]);
  });
});
