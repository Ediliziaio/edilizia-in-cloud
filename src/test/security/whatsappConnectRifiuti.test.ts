/**
 * whatsapp-connect: ogni collegamento rifiutato dice dove si è fermato.
 *
 * Il 15/09/2026 Il Bagno Group ha completato il popup di Meta e la funzione ha
 * risposto 400 senza lasciare traccia: scriveva nei log solo lo scambio del
 * codice. Queste prove tengono insieme quattro cose: ogni risposta d'errore ha
 * il suo log; nei log non finiscono token, codice OAuth, segreto o PIN; vince
 * l'account scelto nel popup; il riquadro rosso mostra anche il motivo di Meta.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readInvokeErrorConDettagli } from "@/lib/readInvokeError";

const sorgente = readFileSync(
  resolve(__dirname, "../../../supabase/functions/whatsapp-connect/index.ts"),
  "utf8",
);
const righe = sorgente.split("\n");

/** Risalendo dal `return`, il primo enunciato è un logRifiuto (prima dell'inizio del blocco)? */
function logPrimaDelReturn(indiceReturn: number): boolean {
  for (let i = indiceReturn - 1; i >= 0; i--) {
    const riga = righe[i].trim();
    if (riga === "" || riga.startsWith("//")) continue;
    if (riga.includes("logRifiuto(")) return true;
    if (riga.endsWith("{")) return false;
  }
  return false;
}

/** Le righe `return new Response(` che rispondono 400, 409 o 500. */
function returnDiErrore(): number[] {
  const trovati: number[] = [];
  righe.forEach((riga, i) => {
    if (!riga.includes("return new Response(")) return;
    const seguito = righe.slice(i, i + 12).join("\n");
    const fine = seguito.indexOf(");");
    const risposta = fine >= 0 ? seguito.slice(0, fine) : seguito;
    if (/status: (400|409|500)\b/.test(risposta)) trovati.push(i);
  });
  return trovati;
}

describe("whatsapp-connect · ogni rifiuto lascia traccia", () => {
  it("tutte le risposte d'errore del collegamento hanno il loro log", () => {
    const errori = returnDiErrore();
    expect(errori.length, "nessuna risposta d'errore trovata: il test non guarda più il file giusto").toBeGreaterThanOrEqual(10);
    const senzaLog = errori.filter((i) => !logPrimaDelReturn(i)).map((i) => `riga ${i + 1}`);
    expect(senzaLog, "risposte d'errore senza logRifiuto").toEqual([]);
  });

  it("nei log non finiscono token, codice OAuth, segreto dell'app o PIN", () => {
    const chiamate = righe.filter((r) => r.includes("logRifiuto(") && !r.includes("function logRifiuto"));
    expect(chiamate.length).toBeGreaterThanOrEqual(10);
    for (const chiamata of chiamate) {
      expect(chiamata).not.toMatch(/\b(accessToken|access_token|APP_SECRET|encryptedAccessToken|cloudApiPin|pin|code|tokenParams|debugParams)\b/);
    }
  });

  it("dell'errore di Meta tiene solo i campi che servono", () => {
    const corpo = sorgente.split("function erroreMeta(")[1]?.split("\n}\n")[0] ?? "";
    expect(corpo).toMatch(/message:/);
    expect(corpo).toMatch(/fbtrace_id:/);
    expect(corpo).not.toMatch(/\.\.\.e\b/);
  });

  it("un account condiviso senza numeri ha un messaggio suo, non quello generico", () => {
    expect(sorgente).toMatch(/logRifiuto\("numeri"/);
    expect(sorgente).toContain("senza nessun numero");
  });

  it("un errore del database non risponde più «collegato»", () => {
    const posSalva = sorgente.indexOf("salvataggioErr");
    expect(posSalva).toBeGreaterThan(0);
    expect(posSalva).toBeLessThan(sorgente.indexOf("success: true"));
    expect(sorgente).toMatch(/logRifiuto\("salvataggio"/);
  });
});

describe("whatsapp-connect · l'account scelto nel popup", () => {
  it("vince l'account delle informazioni di sessione, se il token lo può gestire", () => {
    expect(sorgente).toMatch(/wabaConcessi\.includes\(wabaSuggerito\)/);
  });

  it("vince il numero delle informazioni di sessione, se è in quell'account", () => {
    expect(sorgente).toMatch(/numeri\.find\(\(n\) => String\(n\.id\) === numeroSuggerito\)/);
  });

  it("legge i permessi dal campo `scope`, come li manda Meta (17/09: con `permission` nessun account trovato)", () => {
    expect(sorgente).toMatch(/voce\.scope \?\? voce\.permission/);
    expect(sorgente).not.toMatch(/scope\.permission !== "whatsapp_business_management"/);
  });

  it("senza indicazione dal popup e con più account, sceglie quello senza altre app iscritte", () => {
    const pos = sorgente.indexOf("wabaSenzaAltreApp(wabaConcessi");
    expect(pos).toBeGreaterThan(0);
    expect(sorgente.lastIndexOf("wabaConcessi.length <= 1", pos)).toBeGreaterThan(0);
    const corpo = sorgente.split("async function wabaSenzaAltreApp(")[1]?.split("\n}\n")[0] ?? "";
    expect(corpo).toMatch(/subscribed_apps/);
    expect(corpo).toMatch(/!== nostraApp/);
    expect(corpo).toMatch(/liberi\.length === 1/);
  });

  it("tra più numeri preferisce quello non ancora collegato nel gestionale", () => {
    expect(sorgente).toMatch(/numeri\.find\(\(n\) => !giaCollegati\.has\(String\(n\.id\)\)\)/);
  });
});

describe("readInvokeErrorConDettagli", () => {
  const errore = (corpo: unknown) =>
    Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: { json: async () => corpo },
    });

  it("mostra il motivo di Meta insieme all'errore", async () => {
    await expect(readInvokeErrorConDettagli(errore({
      error: "Impossibile leggere i numeri WhatsApp Business",
      details: "(#100) Missing Permission",
    }))).resolves.toBe("Impossibile leggere i numeri WhatsApp Business — (#100) Missing Permission");
  });

  it("senza dettagli resta l'errore, senza corpo il messaggio", async () => {
    await expect(readInvokeErrorConDettagli(errore({ error: "Missing company_id" }))).resolves.toBe("Missing company_id");
    await expect(readInvokeErrorConDettagli(new Error("rete"))).resolves.toBe("rete");
  });
});
