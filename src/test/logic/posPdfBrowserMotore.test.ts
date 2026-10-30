/**
 * Il motore che disegna il PDF nel browser è il pdfmake 0.3.9 del client, con lo stesso layout del server. Qui si prova
 * il motore vero (in jsdom non c'è il Worker, quindi gira nel thread principale: stesso codice) e il protocollo con il
 * Worker (con un Worker finto, che è il confine).
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disegnaPdfPosNelBrowser } from "@/lib/sicurezza/disegnaPdfPos";
import { esempioPdfPos } from "@/test/fixtures/posEsempioPdf";
import { costruisciHtmlPos } from "../../../supabase/functions/_shared/posHtml";
import { leggiLegamePdfPos } from "../../../supabase/functions/_shared/posPdfLegame";

const emissioneId = "33333333-3333-4333-8333-333333333333";
const base = { html: costruisciHtmlPos(esempioPdfPos()), codice: "TEST-POS-2026", revisione: 0, emessoIl: "2026-10-26T12:00:00+00:00", anteprima: false };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Il motore del browser (pdfmake 0.3.9 del client)", () => {
  it("disegna un PDF che dichiara emissione, impronta del modello e versione del layout, come li legge il server", async () => {
    const pdf = await disegnaPdfPosNelBrowser({ ...base, layoutServer: "pos-pdf-9-riferimento-psc", legame: { emissioneId, htmlSha256: "a".repeat(64) } });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(leggiLegamePdfPos(pdf)).toEqual({ emissioneId, htmlSha256: "a".repeat(64), layout: "pos-pdf-9-riferimento-psc" });
  }, 60_000);

  it("l'anteprima non dichiara nessun legame", async () => {
    const pdf = await disegnaPdfPosNelBrowser({ ...base, anteprima: true });
    expect(leggiLegamePdfPos(pdf)).toBeNull();
  }, 60_000);

  it("se il modello è di un'altra versione del layout non disegna e dice di aggiornare l'app", async () => {
    await expect(disegnaPdfPosNelBrowser({ ...base, layoutServer: "pos-pdf-8-vecchio" })).rejects.toThrow(/aggiorna l'app/);
  });

  it("incorpora gli stessi due Roboto del server: stessi byte, quindi stessa provenienza scritta nel manifest", async () => {
    // Gli stessi due valori sono verificati lato server in posPdfLegame_test.ts contro il pdfmake della funzione.
    const vfs = (await import("pdfmake/build/vfs_fonts.js")) as unknown as { default?: Record<string, string> } & Record<string, string>;
    const font = vfs.default ?? vfs;
    const sha = (nome: string) => createHash("sha256").update(Buffer.from(font[nome], "base64")).digest("hex");
    expect(sha("Roboto-Regular.ttf")).toBe("ab9c18a75da1636435afd2398ffce325496644a8f258f918c92c4baf34a68625");
    expect(sha("Roboto-Medium.ttf")).toBe("4cb9d8a346d7d9190ef145daad9a85d58e2592043b199cdb8ed52ff535c64047");
  });
});

/** Un Worker finto: il confine. Registra i messaggi ricevuti e permette al test di rispondere. */
function workerFinto() {
  const istanze: Array<{ messaggi: unknown[]; terminato: boolean; onmessage: ((e: { data: unknown }) => void) | null; onerror: ((e: { message: string }) => void) | null }> = [];
  class W {
    messaggi: unknown[] = []; terminato = false; onmessage: ((e: { data: unknown }) => void) | null = null; onerror: ((e: { message: string }) => void) | null = null;
    constructor(public url: unknown, public opzioni: unknown) { istanze.push(this); }
    postMessage(m: unknown) { this.messaggi.push(m); }
    terminate() { this.terminato = true; }
  }
  vi.stubGlobal("Worker", W);
  return istanze;
}

describe("Il Worker", () => {
  it("riceve i parametri del disegno, restituisce i byte del PDF e poi viene chiuso", async () => {
    const istanze = workerFinto();
    const attesa = disegnaPdfPosNelBrowser({ ...base });
    await vi.waitFor(() => expect(istanze).toHaveLength(1));
    expect(istanze[0].messaggi).toEqual([{ ...base }]);
    istanze[0].onmessage?.({ data: { tipo: "fatto", bytes: new Uint8Array([37, 80, 68, 70, 45]) } });
    expect(await attesa).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
    expect(istanze[0].terminato).toBe(true);
  });

  it("un errore dichiarato dal Worker, o un errore del Worker stesso, rifiuta e chiude il Worker", async () => {
    for (const guasto of [(w: ReturnType<typeof workerFinto>[0]) => w.onmessage?.({ data: { tipo: "errore", messaggio: "memoria esaurita" } }), (w: ReturnType<typeof workerFinto>[0]) => w.onerror?.({ message: "script non caricato" })]) {
      const istanze = workerFinto();
      const attesa = disegnaPdfPosNelBrowser({ ...base });
      await vi.waitFor(() => expect(istanze).toHaveLength(1));
      guasto(istanze[0]);
      await expect(attesa).rejects.toThrow(/memoria esaurita|script non caricato/);
      expect(istanze[0].terminato).toBe(true);
    }
  });

  it("un Worker che non risponde più non lascia l'utente ad aspettare per sempre", async () => {
    vi.useFakeTimers();
    const istanze = workerFinto();
    const attesa = disegnaPdfPosNelBrowser({ ...base }, 5_000);
    const esito = expect(attesa).rejects.toThrow(/troppo tempo/);
    await vi.advanceTimersByTimeAsync(5_001);
    await esito;
    expect(istanze[0].terminato).toBe(true);
  });
});
