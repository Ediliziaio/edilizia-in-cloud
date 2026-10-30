/**
 * Il motore che disegna il PDF nel browser è il pdfmake 0.3.9 del client, con lo stesso layout del server. Qui si prova
 * il motore vero (in jsdom non c'è il Worker, quindi gira nel thread principale: stesso codice) e il protocollo con il
 * Worker (con un Worker finto, che è il confine).
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disegnaPdfPosNelBrowser } from "@/lib/sicurezza/disegnaPdfPos";
import { ErroreAnnullato } from "@/lib/sicurezza/posPdfBrowser";
import { esempioPdfPos } from "@/test/fixtures/posEsempioPdf";
import { costruisciHtmlPos } from "../../../supabase/functions/_shared/posHtml";

const base = { html: costruisciHtmlPos(esempioPdfPos()), codice: "TEST-POS-2026", revisione: 0, emessoIl: "2026-10-26T12:00:00+00:00", anteprima: false };
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Il motore del browser (pdfmake 0.3.9 del client)", () => {
  it("disegna un PDF intero (intestazione e coda), con il layout del server", async () => {
    const pdf = await disegnaPdfPosNelBrowser({ ...base, layoutServer: "pos-pdf-9-riferimento-psc" });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(new TextDecoder("latin1").decode(pdf.slice(-1024))).toContain("%%EOF");
  }, 60_000);

  it("se il modello è di un'altra versione del layout non disegna e dice di aggiornare l'app", async () => {
    await expect(disegnaPdfPosNelBrowser({ ...base, layoutServer: "pos-pdf-8-vecchio" })).rejects.toThrow(/aggiorna l'app/);
  });

  it("non usa l'orologio del browser: lo stesso modello, con l'orologio a istanti diversi, dà gli stessi identici byte; cambiando la data del server cambiano", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2021-03-04T05:06:07Z"));
    const a = await disegnaPdfPosNelBrowser(base);
    vi.setSystemTime(new Date("2035-11-30T23:59:59Z"));
    const b = await disegnaPdfPosNelBrowser(base);
    const altraData = await disegnaPdfPosNelBrowser({ ...base, emessoIl: "2026-10-27T12:00:00+00:00" });
    expect(sha(a)).toBe(sha(b));
    expect(sha(altraData)).not.toBe(sha(a));   // la data di emissione conta, ed è quella che dà il server
  }, 60_000);

  it("incorpora gli stessi due Roboto del server: stessi byte, quindi stessa provenienza scritta nel manifest", async () => {
    // Gli stessi due valori sono verificati lato server in posRendererCoerenza_test.ts contro il pdfmake della funzione.
    const vfs = (await import("pdfmake/build/vfs_fonts.js")) as unknown as { default?: Record<string, string> } & Record<string, string>;
    const font = vfs.default ?? vfs;
    const impronta = (nome: string) => createHash("sha256").update(Buffer.from(font[nome], "base64")).digest("hex");
    expect(impronta("Roboto-Regular.ttf")).toBe("ab9c18a75da1636435afd2398ffce325496644a8f258f918c92c4baf34a68625");
    expect(impronta("Roboto-Medium.ttf")).toBe("4cb9d8a346d7d9190ef145daad9a85d58e2592043b199cdb8ed52ff535c64047");
  });
});

/** Un Worker finto: il confine. Registra i messaggi ricevuti e permette al test di rispondere. */
type Istanza = { messaggi: unknown[]; terminato: boolean; onmessage: ((e: { data: unknown }) => void) | null; onerror: ((e: { message: string }) => void) | null };
function workerFinto() {
  const istanze: Istanza[] = [];
  class W {
    messaggi: unknown[] = []; terminato = false; onmessage: Istanza["onmessage"] = null; onerror: Istanza["onerror"] = null;
    constructor(public url: unknown, public opzioni: unknown) { istanze.push(this); }
    postMessage(m: unknown) { this.messaggi.push(m); }
    terminate() { this.terminato = true; }
  }
  vi.stubGlobal("Worker", W);
  return istanze;
}
const pronto = (w: Istanza) => w.onmessage?.({ data: { tipo: "pronto" } });

describe("Il Worker", () => {
  it("riceve i parametri del disegno, restituisce i byte del PDF e poi viene chiuso", async () => {
    const istanze = workerFinto();
    const attesa = disegnaPdfPosNelBrowser({ ...base });
    await vi.waitFor(() => expect(istanze).toHaveLength(1));
    expect(istanze[0].messaggi).toEqual([{ ...base }]);
    pronto(istanze[0]);
    istanze[0].onmessage?.({ data: { tipo: "fatto", bytes: new Uint8Array([37, 80, 68, 70, 45]) } });
    expect(await attesa).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
    expect(istanze[0].terminato).toBe(true);
  });

  it("un errore dichiarato dal Worker, o un errore del Worker stesso, rifiuta e chiude il Worker", async () => {
    for (const guasto of [(w: Istanza) => w.onmessage?.({ data: { tipo: "errore", messaggio: "memoria esaurita" } }), (w: Istanza) => w.onerror?.({ message: "script non caricato" })]) {
      const istanze = workerFinto();
      const attesa = disegnaPdfPosNelBrowser({ ...base });
      await vi.waitFor(() => expect(istanze).toHaveLength(1));
      guasto(istanze[0]);
      await expect(attesa).rejects.toThrow(/memoria esaurita|script non caricato/);
      expect(istanze[0].terminato).toBe(true);
    }
  });

  it("un Worker che non parte (nessun «pronto» entro il tempo di avvio, come in una WebView che lo blocca in silenzio) si chiude e si segnala, senza aspettare i minuti del disegno", async () => {
    vi.useFakeTimers();
    const istanze = workerFinto();
    const attesa = disegnaPdfPosNelBrowser({ ...base }, { tempoAvvioMs: 3_000, tempoMassimoMs: 150_000 });
    const esito = expect(attesa).rejects.toThrow(/non riesce ad avviare/);
    await vi.advanceTimersByTimeAsync(3_001);
    await esito;
    expect(istanze[0].terminato).toBe(true);
  });

  it("un Worker partito che non finisce entro il tempo massimo si chiude e si segnala; il tempo del disegno conta dal «pronto»", async () => {
    vi.useFakeTimers();
    const istanze = workerFinto();
    const attesa = disegnaPdfPosNelBrowser({ ...base }, { tempoAvvioMs: 30_000, tempoMassimoMs: 5_000 });
    const esito = expect(attesa).rejects.toThrow(/troppo tempo/);
    await vi.advanceTimersByTimeAsync(20_000);   // il Worker parte dopo 20 s: l'avvio è lento ma riuscito
    pronto(istanze[0]);
    await vi.advanceTimersByTimeAsync(5_001);
    await esito;
    expect(istanze[0].terminato).toBe(true);
  });

  it("annullando, il Worker si chiude subito e l'errore è un annullamento, non un guasto", async () => {
    const istanze = workerFinto();
    const c = new AbortController();
    const attesa = disegnaPdfPosNelBrowser({ ...base }, { segnale: c.signal });
    const esito = expect(attesa).rejects.toBeInstanceOf(ErroreAnnullato);
    await vi.waitFor(() => expect(istanze).toHaveLength(1));
    pronto(istanze[0]);
    c.abort();
    await esito;
    expect(istanze[0].terminato).toBe(true);
  });

  it("se è già annullato non si crea nemmeno il Worker", async () => {
    const istanze = workerFinto();
    const c = new AbortController(); c.abort();
    await expect(disegnaPdfPosNelBrowser({ ...base }, { segnale: c.signal })).rejects.toBeInstanceOf(ErroreAnnullato);
    expect(istanze).toHaveLength(0);
  });
});
