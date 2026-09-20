/**
 * Quando un'iscrizione finisce, anche la sua esecuzione si chiude (20/09/2026).
 *
 * Collaudo degli avvisi «Risposta email»: tre flussi partono sulla stessa
 * email, uno riconosce il contatto e avvisa, gli altri due si fermano sul ramo
 * «No», che non ha uscite. L'iscrizione di questi due risultava «completed»,
 * ma l'esecuzione restava «running» per sempre: nell'elenco delle automazioni
 * due «in corso» in più a ogni risposta. Mancava la chiusura in quattro punti
 * del motore; la regola qui sotto li tiene chiusi tutti, anche i prossimi.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MOTORE = readFileSync(join(__dirname, "../../../supabase/functions/process-automation/index.ts"), "utf8");
const righe = MOTORE.split("\n");

// Gli stati con cui un'iscrizione smette di girare.
const STATO_FINALE = /\.update\(\{ status: (doneStatus|leafStatus|"completed"|"canceled"|"failed"|"removed")/;

// Entro quante righe deve arrivare la chiusura dell'esecuzione.
const FINESTRA = 16;

// L'iscrizione di un'automazione di destinazione senza passi eseguibili: è
// appena stata creata da «iscrivi in automazione», un'esecuzione non ce l'ha.
const SENZA_ESECUZIONE = ['.update({ status: "failed" }).eq("id", enr.id)'];

describe("motore delle automazioni: iscrizione finita, esecuzione chiusa", () => {
  const punti = righe
    .map((testo, i) => ({ testo, i }))
    .filter(({ testo, i }) => STATO_FINALE.test(testo) && righe.slice(Math.max(0, i - 3), i + 1).join("\n").includes("automation_enrollments"))
    .filter(({ testo }) => !SENZA_ESECUZIONE.some((e) => testo.includes(e)));

  it("il motore chiude le iscrizioni in più punti (la regola ha qualcosa da guardare)", () => {
    expect(punti.length).toBeGreaterThanOrEqual(10);
  });

  it("dopo ogni chiusura dell'iscrizione c'è completeExecutionRun", () => {
    const scoperti = punti
      .filter(({ i }) => !righe.slice(i, i + FINESTRA).join("\n").includes("completeExecutionRun("))
      .map(({ i, testo }) => `riga ${i + 1}: ${testo.trim()}`);
    expect(scoperti).toEqual([]);
  });

  it("il ramo senza uscite di una condizione chiude l'esecuzione", () => {
    const dopo = MOTORE.slice(MOTORE.indexOf("const anyLabeled = connections.some"));
    const blocco = dopo.slice(0, dopo.indexOf("// Handle wait_for_event"));
    expect(blocco).toContain('await completeExecutionRun(supabase, queueItem.enrollment_id, "completed");');
  });
});
