/**
 * Il PDF del POS lo disegna il browser (il server ha 2 s di CPU per richiesta). Qui la sequenza che il client segue:
 * il server prepara e prenota, il browser disegna con il legame che il server si aspetta, il server conserva.
 * Le sole cose finte sono i confini: la rete (chiama/carica) e il Worker (disegna).
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { anteprimaPdfConBrowser, emettiPdfConBrowser, ErroreDisegnoPos, type DipendenzePdfPos } from "@/lib/sicurezza/posPdfBrowser";

const html = "<html>modello àèìòù — POS</html>";
const sha256 = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const prenotazione = { ok: true, emissione_id: "emissione-1", token: "token-1", emesso_il: "2026-10-30T10:00:00+00:00", html, layout: "pos-pdf-9-riferimento-psc", codice: "ORD-1", revisione: 2 };
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);

function prova(over: { chiama?: (c: Record<string, unknown>) => unknown; carica?: DipendenzePdfPos["carica"]; disegna?: DipendenzePdfPos["disegna"] } = {}) {
  const chiamate: Record<string, unknown>[] = [];
  const dip: DipendenzePdfPos = {
    chiama: vi.fn(async (corpo: Record<string, unknown>) => { chiamate.push(corpo); return (over.chiama ? over.chiama(corpo) : corpo.azione === "prepara_emissione" ? prenotazione : { ok: true }) as never; }),
    carica: vi.fn(over.carica ?? (async () => ({ emissione_id: "emissione-1", approvato_da_nome: "Mario Rossi" }))),
    disegna: vi.fn(over.disegna ?? (async () => pdf)),
  };
  return { dip, chiamate };
}

describe("Approvazione con il PDF disegnato dal browser", () => {
  it("prepara, disegna con il legame che il server si aspetta e solo allora carica il PDF con la sua impronta", async () => {
    const { dip, chiamate } = prova();
    const r = await emettiPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1", attesaUpdatedAt: "2026-10-30T09:00:00Z" });
    expect(chiamate).toEqual([{ azione: "prepara_emissione", company_id: "azienda-a", pos_id: "pos-1", attesa_updated_at: "2026-10-30T09:00:00Z" }]);
    expect(dip.disegna).toHaveBeenCalledWith({ html, codice: "ORD-1", revisione: 2, emessoIl: "2026-10-30T10:00:00+00:00", anteprima: false, layoutServer: "pos-pdf-9-riferimento-psc",
      legame: { emissioneId: "emissione-1", htmlSha256: sha256(html) } });
    expect(dip.carica).toHaveBeenCalledWith({ azione: "completa_emissione", company_id: "azienda-a", emissione_id: "emissione-1", token: "token-1", pdf_sha256: sha256(pdf) }, pdf);
    expect(r).toEqual({ emissioneId: "emissione-1", approvatoDaNome: "Mario Rossi" });
  });

  it("l'emissione da una copia archiviata chiede la copia (snapshot_id) e non manda la versione dell'editor", async () => {
    const { dip, chiamate } = prova();
    await emettiPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1", snapshotId: "copia-7" });
    expect(chiamate[0]).toEqual({ azione: "prepara_emissione", company_id: "azienda-a", pos_id: "pos-1", snapshot_id: "copia-7" });
  });

  it("se il server dice che è già approvato (o l'emissione è già completa) non disegna nulla", async () => {
    for (const risposta of [{ ok: true, gia_approvato: true }, { ok: true, gia_completa: true, emissione_id: "emissione-1" }]) {
      const { dip } = prova({ chiama: () => risposta });
      const r = await emettiPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1", attesaUpdatedAt: "x" });
      expect(r.gia).toBe(true);
      expect(dip.disegna).not.toHaveBeenCalled();
      expect(dip.carica).not.toHaveBeenCalled();
    }
  });

  it("un errore del server in preparazione (POS cambiato, voci mancanti) passa com'è: niente disegno, niente da annullare", async () => {
    const errore = Object.assign(new Error("Il POS è cambiato rispetto alla versione che hai letto"), { status: 409 });
    const { dip, chiamate } = prova({ chiama: () => { throw errore; } });
    await expect(emettiPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1", attesaUpdatedAt: "x" })).rejects.toBe(errore);
    expect(dip.disegna).not.toHaveBeenCalled();
    expect(chiamate.map((c) => c.azione)).toEqual(["prepara_emissione"]);
  });

  it("se il browser non riesce a disegnare libera subito la prenotazione e segnala un errore di disegno (il chiamante può ripiegare)", async () => {
    const { dip, chiamate } = prova({ disegna: async () => { throw new Error("memoria esaurita"); } });
    await expect(emettiPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1", attesaUpdatedAt: "x" })).rejects.toBeInstanceOf(ErroreDisegnoPos);
    expect(chiamate.at(-1)).toEqual({ azione: "annulla_emissione", company_id: "azienda-a", emissione_id: "emissione-1", token: "token-1" });
    expect(dip.carica).not.toHaveBeenCalled();
  });

  it("se il caricamento fallisce rilancia l'errore del server e libera la prenotazione, anche se liberarla a sua volta non riesce", async () => {
    const errore = Object.assign(new Error("Il POS è cambiato durante la preparazione del PDF"), { status: 409 });
    const { dip, chiamate } = prova({ carica: async () => { throw errore; }, chiama: (c) => { if (c.azione === "annulla_emissione") throw new Error("rete"); return prenotazione; } });
    await expect(emettiPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1", attesaUpdatedAt: "x" })).rejects.toBe(errore);
    expect(chiamate.at(-1)?.azione).toBe("annulla_emissione");
  });
});

describe("Anteprima con il PDF disegnato dal browser", () => {
  it("chiede l'HTML della bozza, lo disegna con la filigrana (senza legame) e restituisce un PDF da aprire", async () => {
    const { dip, chiamate } = prova({ chiama: () => ({ ok: true, html, layout: "pos-pdf-9-riferimento-psc", codice: "ORD-1", revisione: 0, emessoIl: "2026-10-30T10:05:00Z" }) });
    const blob = await anteprimaPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1" });
    expect(chiamate).toEqual([{ azione: "anteprima_html", company_id: "azienda-a", pos_id: "pos-1" }]);
    expect(dip.disegna).toHaveBeenCalledWith({ html, codice: "ORD-1", revisione: 0, emessoIl: "2026-10-30T10:05:00Z", anteprima: true, layoutServer: "pos-pdf-9-riferimento-psc" });
    expect(blob.type).toBe("application/pdf");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(pdf);
  });

  it("se il disegno fallisce lo segnala come errore di disegno, perché il chiamante possa ripiegare sul server", async () => {
    const { dip } = prova({ chiama: () => ({ ok: true, html, layout: "x", codice: "c", revisione: 0, emessoIl: "2026-10-30T10:05:00Z" }), disegna: async () => { throw new Error("Worker bloccato"); } });
    await expect(anteprimaPdfConBrowser(dip, { companyId: "azienda-a", posId: "pos-1" })).rejects.toBeInstanceOf(ErroreDisegnoPos);
  });
});
