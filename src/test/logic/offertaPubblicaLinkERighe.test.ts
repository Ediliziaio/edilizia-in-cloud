/**
 * Il link pubblico dell'offerta (/offerta/<token>).
 *
 * 1) La ROTTA. App.tsx aveva due rotte sorelle, «/offerta/:slug» (checkout dei
 *    piani Edilizia in Cloud, dal 15/07/2026) e «/offerta/:token» (firma del
 *    preventivo). React Router non le distingue: vince la prima, e ogni link di
 *    firma («Copia link», pagina Firma elettronica, promemoria di scadenza)
 *    mostrava «Offerta non trovata … contatta il tuo referente Edilizia in Cloud».
 * 2) Le RIGHE che il cliente vede: le stesse regole del PDF (nota, subtotale,
 *    opzionale fuori dal totale, nascoste).
 * 3) I MESSAGGI quando la funzione dice «non valido».
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchRoutes } from "react-router-dom";
import {
  eLinkNonValido,
  eTokenOffertaPreventivo,
  messaggioDaErroreFirma,
  messaggioOffertaNonDisponibile,
  righeOffertaPubblica,
} from "@/lib/preventivi/offertaPubblica";

const TOKEN = "5f1c0a9e-7d2b-4c3a-8e11-0123456789ab";
const appSorgente = readFileSync("src/App.tsx", "utf8");

/** Le rotte di App.tsx come le vede il router: percorso + il componente che le serve. */
function rotteDiApp() {
  return [...appSorgente.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)].map(([, path, componente]) => ({ path, id: componente }));
}

describe("rotte: due rotte sorelle con parametri diversi non si distinguono", () => {
  it("nessuna coppia di rotte di App.tsx ha la stessa forma (/offerta/:slug e /offerta/:token vincevano la prima)", () => {
    const viste = new Map<string, string>();
    const doppie: string[] = [];
    for (const { path } of rotteDiApp()) {
      const forma = path.replace(/:[A-Za-z_]+/g, ":");
      if (viste.has(forma)) doppie.push(`${viste.get(forma)} ~ ${path}`);
      else viste.set(forma, path);
    }
    expect(doppie).toEqual([]);
  });

  it("il router manda il token di firma e lo slug del checkout alla stessa pagina «ponte», e «grazie» alla sua", () => {
    const rotte = rotteDiApp();
    const quale = (url: string) => matchRoutes(rotte, url)?.map((m) => m.route.id);
    expect(quale(`/offerta/${TOKEN}`)).toEqual(["OffertaPubblica"]);
    expect(quale("/offerta/clienti-marketing")).toEqual(["OffertaPubblica"]);
    expect(quale("/offerta/grazie")).toEqual(["OffertaGrazie"]);
  });
});

describe("eTokenOffertaPreventivo: il token di firma è un UUID, lo slug di un piano no", () => {
  it.each([
    [TOKEN, true],
    [TOKEN.toUpperCase(), true],
    ["clienti-marketing", false],
    ["offerta-clienti-marketing", false],
    ["grazie", false],
    ["5f1c0a9e7d2b4c3a8e110123456789ab", false], // senza trattini: quote-sign lo rifiuta
    ["", false],
  ])("%s → %s", (valore, atteso) => {
    expect(eTokenOffertaPreventivo(valore)).toBe(atteso);
  });
  it("valori assenti non sono token", () => {
    expect(eTokenOffertaPreventivo(undefined)).toBe(false);
    expect(eTokenOffertaPreventivo(null)).toBe(false);
  });
});

describe("righeOffertaPubblica: cosa vede il cliente delle righe che firma", () => {
  const riga = (extra: Record<string, unknown>) => ({ name: "x", item_type: "product", item_category: "prodotto", is_optional: false, mostra_nel_pdf: true, ...extra });

  it("nasconde le righe «nascoste al cliente» e i «subtotale» (etichette del builder, senza importo)", () => {
    const visibili = righeOffertaPubblica([
      riga({ name: "Finestra" }),
      riga({ name: "Segreta", mostra_nel_pdf: false }),
      riga({ name: "Subtotale", item_category: "subtotale" }),
      riga({ name: "Titolo", item_type: "section" }),
    ]);
    expect(visibili.map((r) => r.riga.name)).toEqual(["Finestra"]);
  });

  it("le note sono testo (genere «nota»), le altre righe sono righe", () => {
    const [nota, voce] = righeOffertaPubblica([riga({ name: "Posa inclusa", item_category: "nota" }), riga({ name: "Porta" })]);
    expect(nota.genere).toBe("nota");
    expect(voce.genere).toBe("riga");
  });

  it("posa, smaltimento, trasporto e nolo sono figlie; una categoria vuota è una voce normale", () => {
    const righe = righeOffertaPubblica([
      riga({ item_category: "prodotto" }), riga({ item_category: "posa" }), riga({ item_category: "smaltimento" }),
      riga({ item_category: "trasporto" }), riga({ item_category: "nolo" }), riga({ item_category: null }),
    ]);
    expect(righe.map((r) => r.figlia)).toEqual([false, true, true, true, true, false]);
  });

  it("le opzioni sono dette tali; una nota non è mai un'opzione", () => {
    const righe = righeOffertaPubblica([riga({ is_optional: true }), riga({ is_optional: false }), riga({ is_optional: null }), riga({ item_category: "nota", is_optional: true })]);
    expect(righe.map((r) => r.opzionale)).toEqual([true, false, false, false]);
  });

  it("l'ordine è quello delle righe", () => {
    const righe = righeOffertaPubblica([riga({ name: "A" }), riga({ name: "B" }), riga({ name: "C" })]);
    expect(righe.map((r) => r.riga.name)).toEqual(["A", "B", "C"]);
  });
});

describe("messaggi per il cliente", () => {
  it.each(["expired", "token_invalid", "already_signed", "invalid_status"])("«%s» ha una frase italiana, non il codice", (codice) => {
    const frase = messaggioOffertaNonDisponibile(codice);
    expect(frase).not.toContain(codice);
    expect(frase).not.toMatch(/_/);
    expect(frase.length).toBeGreaterThan(20);
  });
  it("un codice sconosciuto o assente cade sul messaggio generico", () => {
    expect(messaggioOffertaNonDisponibile("boh")).toBe(messaggioOffertaNonDisponibile(undefined));
    expect(messaggioOffertaNonDisponibile(null)).toMatch(/Riprova/);
  });

  it("l'errore HTTP di supabase-js: la frase vera sta nel corpo (message prima di error)", async () => {
    const errore = { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "consensi_mancanti", message: "Per firmare serve accettare le clausole." }) } };
    expect(await messaggioDaErroreFirma(errore, "riserva")).toBe("Per firmare serve accettare le clausole.");
    const soloError = { context: { json: async () => ({ error: "Questo preventivo richiede la firma con codice OTP." }) } };
    expect(await messaggioDaErroreFirma(soloError, "riserva")).toBe("Questo preventivo richiede la firma con codice OTP.");
  });
  it("senza corpo leggibile si usa il testo di riserva (mai il generico «non-2xx»)", async () => {
    expect(await messaggioDaErroreFirma(new Error("Edge Function returned a non-2xx status code"), "Errore durante la firma.")).toBe("Errore durante la firma.");
    expect(await messaggioDaErroreFirma({ context: { json: async () => { throw new Error("non json"); } } }, "riserva")).toBe("riserva");
  });
});

describe("eLinkNonValido: solo il 404 di quote-sign è «link non valido»", () => {
  it("404 (link sconosciuto o preventivo nel cestino) sì", () => {
    expect(eLinkNonValido({ message: "non-2xx", context: { status: 404 } })).toBe(true);
  });
  it.each([400, 401, 403, 409, 500, 502])("%s no: è un guasto o un'altra regola", (stato) => {
    expect(eLinkNonValido({ context: { status: stato } })).toBe(false);
  });
  it("errori senza risposta (rete assente, eccezione qualunque, nulla) no", () => {
    expect(eLinkNonValido(new Error("Failed to fetch"))).toBe(false);
    expect(eLinkNonValido({ context: {} })).toBe(false);
    expect(eLinkNonValido({ context: { status: "404" } })).toBe(false);
    expect(eLinkNonValido(null)).toBe(false);
    expect(eLinkNonValido(undefined)).toBe(false);
  });
});
