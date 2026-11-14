/**
 * «QR code is not ready yet» non è un errore (14/11/2026).
 *
 * Premendo «Ricollega» su un numero di WhatsApp Locale compariva in rosso:
 *
 *     Gateway: 400 {"message":"QR code is not ready yet. Please wait...",
 *                   "error":"Bad Request","statusCode":400}
 *
 * Il gateway stava solo dicendo di aspettare: dopo `start` il motore impiega
 * qualche secondo a caricare WhatsApp Web, e finché non ha finito il QR non
 * esiste. La sessione era ripartita davvero — quel numero risultava connesso
 * pochi minuti dopo — ma il dialog buttava via session_id, QR e polling e
 * tornava al pulsante «Riprova a ricollegare», quindi il QR non arrivava mai.
 *
 * Qui: la regola che distingue l'attesa dal guasto, e le due righe di codice
 * che devono continuare a comportarsi di conseguenza.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { eQrNonPronto } from "../../../supabase/functions/_shared/openwaStato";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(RADICE, p), "utf8");

describe("l'attesa del QR si riconosce dal guasto", () => {
  it("il messaggio vero del 14/11/2026 è un'attesa", () => {
    expect(eQrNonPronto({
      status: 400,
      text: '{"message":"QR code is not ready yet. Please wait...","error":"Bad Request","statusCode":400}',
    })).toBe(true);
  });

  it("basta «please wait», comunque sia scritto il resto", () => {
    expect(eQrNonPronto({ status: 400, text: "Please wait, generating QR" })).toBe(true);
    expect(eQrNonPronto({ status: 400, text: "qr NOT READY" })).toBe(true);
  });

  it("un 400 che parla d'altro resta un errore da mostrare", () => {
    expect(eQrNonPronto({ status: 400, text: '{"message":"Session not found"}' })).toBe(false);
    expect(eQrNonPronto({ status: 400, text: "name must be alphanumeric" })).toBe(false);
    expect(eQrNonPronto({ status: 400 })).toBe(false);
  });

  it("non copre gli altri codici: un 500 è un guasto anche se dice «wait»", () => {
    expect(eQrNonPronto({ status: 500, text: "please wait" })).toBe(false);
    expect(eQrNonPronto({ status: 404, text: "not ready" })).toBe(false);
  });
});

describe("get_qr risponde «aspetta» invece di un 502", () => {
  const edge = leggi("supabase/functions/openwa-gateway/index.ts");

  it("controlla l'attesa PRIMA di trasformare la risposta in errore", () => {
    const bloccoQr = edge.slice(edge.indexOf('if (action === "get_qr")'));
    const attesa = bloccoQr.indexOf("eQrNonPronto");
    const errore = bloccoQr.indexOf("status: 502");
    expect(attesa).toBeGreaterThan(-1);
    expect(errore).toBeGreaterThan(-1);
    // Se l'ordine si invertisse, il 400 tornerebbe a uscire come guasto.
    expect(attesa).toBeLessThan(errore);
  });

  it("l'attesa esce come esito buono, con in_attesa", () => {
    expect(edge).toMatch(/ok: true, qr: null, in_attesa: true/);
  });
});

describe("il dialog non butta via la sessione mentre aspetta il QR", () => {
  const panel = leggi("src/components/admin/settings/whatsapp-locale/WhatsappLocalePanel.tsx");
  const ricollega = panel.slice(
    panel.indexOf("async function avviaRicollegamento"),
    panel.indexOf("async function openRelinkDialog"),
  );

  it("una chiamata al QR andata male non annulla il riavvio appena riuscito", () => {
    // `restart_session` è andato a buon fine: da lì in poi la sessione resta.
    const dopoRestart = ricollega.slice(ricollega.indexOf("setSessionId(nuovoSid)"));
    expect(dopoRestart).toMatch(/setPolling\(true\)/);
    // get_qr ha il suo catch: non può far scattare quello esterno che pulisce.
    expect(dopoRestart).toMatch(/get_qr[\s\S]*?\} catch \{/);
  });

  it("il polling richiede il QR a ogni giro finché non c'è", () => {
    expect(panel).toMatch(/if \(!qrRef\.current \|\| ticks % 7 === 0\)/);
  });

  it("in attesa scrive che il QR si sta preparando, non un errore", () => {
    expect(panel).toMatch(/Il QR si sta preparando/);
  });
});
