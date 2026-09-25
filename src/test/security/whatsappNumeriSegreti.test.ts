/**
 * Numeri WhatsApp: token e PIN fuori dal browser (25/09/2026).
 *
 * ai_whatsapp_numbers tiene il token di Meta (cifrato) e teneva in chiaro il PIN
 * della verifica in due passaggi. Il database non dà più queste due colonne al
 * ruolo authenticated: una lettura dal browser che le chiede, o che chiede «*»,
 * fallisce con «permission denied». E i numeri li crea solo whatsapp-connect,
 * col service role.
 *
 * Si prova che nessuna lettura della tabella nel codice del browser:
 *   · chiede «*» o una select vuota (che vale «*»);
 *   · nomina access_token_encrypted o cloud_api_pin;
 *   · crea righe (insert, upsert).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { WA_NUMBER_COLUMNS } from "@/hooks/whatsapp/useWhatsAppNumbers";

const RADICE = resolve(__dirname, "../../..");
const SEGRETE = ["access_token_encrypted", "cloud_api_pin"];

function fileTs(cartella: string): string[] {
  const risultato: string[] = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === "node_modules" || voce === "test") continue;
      risultato.push(...fileTs(percorso));
    } else if (/\.(ts|tsx)$/.test(voce) && !voce.endsWith(".d.ts")) {
      risultato.push(percorso);
    }
  }
  return risultato;
}

// Ogni query che parte da .from("ai_whatsapp_numbers"): fino al punto e virgola,
// o fino alla query successiva (due query nello stesso Promise.all).
function queryDellaTabella(sorgente: string): string[] {
  const query: string[] = [];
  const INIZIO = 'from("ai_whatsapp_numbers")';
  let i = sorgente.indexOf(INIZIO);
  while (i >= 0) {
    const prossima = sorgente.indexOf(".from(", i + 1);
    const puntoEVirgola = sorgente.indexOf(";", i);
    const fine = Math.min(...[prossima, puntoEVirgola, sorgente.length].filter((n) => n >= 0));
    query.push(sorgente.slice(i, fine));
    i = sorgente.indexOf(INIZIO, i + 1);
  }
  return query;
}

const queryDelBrowser = fileTs(join(RADICE, "src"))
  .filter((file) => !file.endsWith("integrations/supabase/types.ts"))
  .flatMap((file) =>
    queryDellaTabella(readFileSync(file, "utf8")).map((testo) => ({ file: file.replace(RADICE + "/", ""), testo })),
  );

describe("il browser e ai_whatsapp_numbers", () => {
  it("le query ci sono (il controllo guarda davvero qualcosa)", () => {
    expect(queryDelBrowser.length).toBeGreaterThanOrEqual(6);
  });

  it("nessuna chiede «*» o una select vuota", () => {
    const trovate = queryDelBrowser.filter(({ testo }) => /\.select\(\s*(["'`]\s*\*\s*["'`])?\s*\)/.test(testo));
    expect(trovate.map((q) => q.file)).toEqual([]);
  });

  it("nessuna nomina il token o il PIN", () => {
    const trovate = queryDelBrowser.filter(({ testo }) => SEGRETE.some((colonna) => testo.includes(colonna)));
    expect(trovate.map((q) => q.file)).toEqual([]);
    for (const colonna of SEGRETE) expect(WA_NUMBER_COLUMNS).not.toContain(colonna);
  });

  it("nessuna crea numeri: li crea whatsapp-connect, dopo le verifiche su Meta", () => {
    const trovate = queryDelBrowser.filter(({ testo }) => /\.(insert|upsert)\(/.test(testo));
    expect(trovate.map((q) => q.file)).toEqual([]);
  });
});
