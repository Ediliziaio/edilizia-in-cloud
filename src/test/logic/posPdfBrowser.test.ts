/**
 * Il PDF del POS lo disegna il browser (il server ha 2 s di CPU per richiesta). Qui la sequenza che il client segue:
 * il server prepara e prenota, il browser disegna il modello che il server gli ha dato, il server controlla e conserva.
 * Le sole cose finte sono i confini: la rete (chiama/carica) e il Worker (disegna).
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { anteprimaPdfConBrowser, emettiPdfConBrowser, ErroreAnnullato, ErroreDisegnoPos, type DipendenzePdfPos, type FasePdf } from "@/lib/sicurezza/posPdfBrowser";

const html = "<html>modello àèìòù — POS</html>";
const sha256 = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const prenotazione = { ok: true, emissione_id: "emissione-1", token: "token-1", emesso_il: "2026-10-30T10:00:00+00:00", html, layout: "pos-pdf-10-design", codice: "ORD-1", revisione: 2 };
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);
/** I byte di un Blob, letti con le API di jsdom (quelle di Node non lo conoscono). */
const leggiByte = (b: Blob) => new Promise<Uint8Array>((ok, ko) => { const l = new FileReader(); l.onload = () => ok(new Uint8Array(l.result as ArrayBuffer)); l.onerror = () => ko(l.error); l.readAsArrayBuffer(b); });

function prova(over: { chiama?: (c: Record<string, unknown>) => unknown; carica?: DipendenzePdfPos["carica"]; disegna?: DipendenzePdfPos["disegna"] } = {}) {
  const chiamate: Record<string, unknown>[] = [];
  const fasi: FasePdf[] = [];
  const dip: DipendenzePdfPos = {
    chiama: vi.fn(async (corpo: Record<string, unknown>) => { chiamate.push(corpo); return (over.chiama ? over.chiama(corpo) : corpo.azione === "prepara_emissione" ? prenotazione : { ok: true }) as never; }),
    carica: vi.fn(over.carica ?? (async () => ({ emissione_id: "emissione-1", approvato_da_nome: "Mario Rossi" }))),
    disegna: vi.fn(over.disegna ?? (async () => pdf)),
  };
  return { dip, chiamate, fasi, opzioni: (segnale?: AbortSignal) => ({ segnale, onFase: (f: FasePdf) => { fasi.push(f); } }) };
}
const richiesta = { companyId: "azienda-a", posId: "pos-1", attesaUpdatedAt: "2026-10-30T09:00:00Z" };
/** Una promessa che si risolve quando lo decide il test: serve a fermare la rete o il Worker a metà. */
function aspetta<T>() { let ok!: (v: T) => void; const promessa = new Promise<T>((r) => { ok = r; }); return { promessa, ok }; }

describe("Approvazione con il PDF disegnato dal browser", () => {
  it("prepara, disegna il modello del server e carica il PDF con le impronte che dichiara (PDF, modello, layout)", async () => {
    const { dip, chiamate, fasi, opzioni } = prova();
    const r = await emettiPdfConBrowser(dip, richiesta, opzioni());
    expect(chiamate).toEqual([{ azione: "prepara_emissione", company_id: "azienda-a", pos_id: "pos-1", attesa_updated_at: "2026-10-30T09:00:00Z" }]);
    expect(dip.disegna).toHaveBeenCalledWith({ html, codice: "ORD-1", revisione: 2, emessoIl: "2026-10-30T10:00:00+00:00", anteprima: false, layoutServer: "pos-pdf-10-design" }, undefined);
    expect(dip.carica).toHaveBeenCalledWith({ azione: "completa_emissione", company_id: "azienda-a", emissione_id: "emissione-1", token: "token-1",
      pdf_sha256: sha256(pdf), html_sha256: sha256(html), layout: "pos-pdf-10-design" }, pdf);
    expect(r).toEqual({ emissioneId: "emissione-1", approvatoDaNome: "Mario Rossi" });
    expect(fasi).toEqual(["prepara", "disegna", "conserva"]);
  });

  it("l'emissione da una copia archiviata chiede la copia (snapshot_id) e non manda la versione dell'editor", async () => {
    const { dip, chiamate } = prova();
    await emettiPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1", snapshotId: "copia-7" });
    expect(chiamate[0]).toEqual({ azione: "prepara_emissione", company_id: "azienda-a", pos_id: "pos-1", snapshot_id: "copia-7" });
  });

  it("se il server dice che è già approvato (o l'emissione è già completa) non disegna nulla", async () => {
    for (const risposta of [{ ok: true, gia_approvato: true }, { ok: true, gia_completa: true, emissione_id: "emissione-1" }]) {
      const { dip } = prova({ chiama: () => risposta });
      const r = await emettiPdfConBrowser(dip, richiesta);
      expect(r.gia).toBe(true);
      expect(dip.disegna).not.toHaveBeenCalled();
      expect(dip.carica).not.toHaveBeenCalled();
    }
  });

  it("un errore del server in preparazione (POS cambiato, voci mancanti) passa com'è: niente disegno, niente da annullare", async () => {
    const errore = Object.assign(new Error("Il POS è cambiato rispetto alla versione che hai letto"), { status: 409 });
    const { dip, chiamate } = prova({ chiama: () => { throw errore; } });
    await expect(emettiPdfConBrowser(dip, richiesta)).rejects.toBe(errore);
    expect(dip.disegna).not.toHaveBeenCalled();
    expect(chiamate.map((c) => c.azione)).toEqual(["prepara_emissione"]);
  });

  it("se il browser non riesce a disegnare libera subito la prenotazione e segnala un errore di disegno (il chiamante può ripiegare)", async () => {
    const { dip, chiamate, fasi, opzioni } = prova({ disegna: async () => { throw new Error("memoria esaurita"); } });
    await expect(emettiPdfConBrowser(dip, richiesta, opzioni())).rejects.toBeInstanceOf(ErroreDisegnoPos);
    expect(chiamate.at(-1)).toEqual({ azione: "annulla_emissione", company_id: "azienda-a", emissione_id: "emissione-1", token: "token-1" });
    expect(dip.carica).not.toHaveBeenCalled();
    expect(fasi).toEqual(["prepara", "disegna"]);
  });

  it("se il caricamento fallisce rilancia l'errore del server e libera la prenotazione, anche se liberarla a sua volta non riesce", async () => {
    const errore = Object.assign(new Error("Il POS è cambiato durante la preparazione del PDF"), { status: 409 });
    const { dip, chiamate } = prova({ carica: async () => { throw errore; }, chiama: (c) => { if (c.azione === "annulla_emissione") throw new Error("rete"); return prenotazione; } });
    await expect(emettiPdfConBrowser(dip, richiesta)).rejects.toBe(errore);
    expect(chiamate.at(-1)?.azione).toBe("annulla_emissione");
  });
});

describe("Annullare mentre il PDF si prepara", () => {
  it("se l'utente ha già annullato non parte nemmeno la richiesta", async () => {
    const { dip, chiamate } = prova();
    const c = new AbortController(); c.abort();
    await expect(emettiPdfConBrowser(dip, richiesta, { segnale: c.signal })).rejects.toBeInstanceOf(ErroreAnnullato);
    expect(chiamate).toEqual([]);
  });

  it("annullando mentre il server prepara, la fase diventa «annullo» SUBITO (il server può metterci un po' a rispondere) e, appena la prenotazione c'è, la libera e non disegna", async () => {
    const attesa = aspetta<unknown>();
    const { dip, chiamate, fasi, opzioni } = prova({ chiama: (c) => c.azione === "prepara_emissione" ? attesa.promessa : { ok: true } });
    const c = new AbortController();
    const esito = emettiPdfConBrowser(dip, richiesta, opzioni(c.signal));
    const atteso = expect(esito).rejects.toBeInstanceOf(ErroreAnnullato);
    c.abort();
    expect(fasi).toEqual(["prepara", "annullo"]);   // prima ancora che il server risponda
    attesa.ok(prenotazione);
    await atteso;
    expect(dip.disegna).not.toHaveBeenCalled();
    expect(chiamate.map((x) => x.azione)).toEqual(["prepara_emissione", "annulla_emissione"]);
    expect(fasi).toEqual(["prepara", "annullo"]);   // e nessun'altra fase dopo
  });

  it("annullando mentre il Worker disegna, il disegno si ferma, la prenotazione si libera e NON è un errore di disegno (niente ripiego sul server)", async () => {
    const { dip, chiamate, fasi, opzioni } = prova({ disegna: (_p, segnale) => new Promise((_ok, ko) => { segnale?.addEventListener("abort", () => ko(new ErroreAnnullato())); }) });
    const c = new AbortController();
    const esito = emettiPdfConBrowser(dip, richiesta, opzioni(c.signal));
    const atteso = expect(esito).rejects.toBeInstanceOf(ErroreAnnullato);
    await vi.waitFor(() => expect(dip.disegna).toHaveBeenCalled());
    c.abort();
    expect(fasi).toEqual(["prepara", "disegna", "annullo"]);
    await atteso;
    expect(chiamate.at(-1)?.azione).toBe("annulla_emissione");
    expect(dip.carica).not.toHaveBeenCalled();
  });

  it("una volta iniziato il caricamento non si annulla più: il server potrebbe già aver conservato, e il risultato conta", async () => {
    const attesa = aspetta<{ emissione_id: string; approvato_da_nome?: string }>();
    const { dip, chiamate, fasi, opzioni } = prova({ carica: () => attesa.promessa });
    const c = new AbortController();
    const esito = emettiPdfConBrowser(dip, richiesta, opzioni(c.signal));
    await vi.waitFor(() => expect(dip.carica).toHaveBeenCalled());
    c.abort(); attesa.ok({ emissione_id: "emissione-1", approvato_da_nome: "Mario Rossi" });
    expect(await esito).toEqual({ emissioneId: "emissione-1", approvatoDaNome: "Mario Rossi" });
    expect(chiamate.map((x) => x.azione)).toEqual(["prepara_emissione"]);
    expect(fasi).toEqual(["prepara", "disegna", "conserva"]);   // nessun «annullo»: l'operazione non si ferma, e l'avviso sarebbe falso
  });
});

describe("Anteprima con il PDF disegnato dal browser", () => {
  const anteprima = { ok: true, html, layout: "pos-pdf-10-design", codice: "ORD-1", revisione: 0, emessoIl: "2026-10-30T10:05:00Z" };

  it("chiede l'HTML della bozza al server, lo disegna con la filigrana (la data è quella del server) e restituisce un PDF da aprire", async () => {
    const { dip, chiamate, fasi, opzioni } = prova({ chiama: () => anteprima });
    const blob = await anteprimaPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1" }, opzioni());
    expect(chiamate).toEqual([{ azione: "anteprima_html", company_id: "azienda-a", pos_id: "pos-1" }]);
    expect(dip.disegna).toHaveBeenCalledWith({ html, codice: "ORD-1", revisione: 0, emessoIl: "2026-10-30T10:05:00Z", anteprima: true, layoutServer: "pos-pdf-10-design" }, undefined);
    expect(blob.type).toBe("application/pdf");
    expect(await leggiByte(blob)).toEqual(pdf);
    expect(fasi).toEqual(["prepara", "disegna"]);
  });

  it("se il disegno fallisce lo segnala come errore di disegno, perché il chiamante possa ripiegare sul server", async () => {
    const { dip } = prova({ chiama: () => anteprima, disegna: async () => { throw new Error("Worker bloccato"); } });
    await expect(anteprimaPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1" })).rejects.toBeInstanceOf(ErroreDisegnoPos);
  });

  it("annullando mentre il Worker disegna, l'anteprima si ferma senza ripiego e senza errori", async () => {
    const { dip, fasi, opzioni } = prova({ chiama: () => anteprima, disegna: (_p, segnale) => new Promise((_ok, ko) => { segnale?.addEventListener("abort", () => ko(new ErroreAnnullato())); }) });
    const c = new AbortController();
    const esito = anteprimaPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1" }, opzioni(c.signal));
    const atteso = expect(esito).rejects.toBeInstanceOf(ErroreAnnullato);
    await vi.waitFor(() => expect(dip.disegna).toHaveBeenCalled());
    c.abort();
    expect(fasi).toEqual(["prepara", "disegna", "annullo"]);
    await atteso;
  });
});
