/**
 * La guardia della regola d'oro (docs/piano-modelli-preventivo.md): copiare e
 * cambiare un modello NON deve toccare nessun altro modello.
 *
 * Per ogni modello della libreria tiene un'impronta (contentSha256 di
 * inspectModule68) in src/test/fixtures/impronteModelli.json. Se un lotto cambia
 * per sbaglio anche un solo altro modello, l'impronta non torna e il test è rosso:
 * si annulla la modifica, non si aggiorna l'impronta.
 *
 * Aggiungere i modelli nuovi di un lotto (aggiunge SOLO le impronte mancanti, mai
 * cambia quelle esistenti):
 *   IMPRONTE_NUOVE=1 npx vitest run src/test/logic/impronteModelli.test.ts
 *
 * Un'impronta esistente si aggiorna a mano solo per un cambio VOLUTO su quel
 * modello, dichiarato nel messaggio del commit.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MODULE68_MODELS, inspectModule68 } from "../audits/module68ContentAudit";

const FIXTURE = resolve("src/test/fixtures/impronteModelli.json");
const attuali: Record<string, string> = Object.fromEntries(
  MODULE68_MODELS.map((m) => [m.key, inspectModule68(m.area, m.id).contentSha256]),
);
const salvate: Record<string, string> = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, "utf8")) : {};

describe("impronte dei modelli", () => {
  if (process.env.IMPRONTE_NUOVE === "1") {
    it("aggiunge solo le impronte mancanti, senza cambiare quelle esistenti", () => {
      const prima = { ...salvate };
      let aggiunte = 0;
      for (const [key, sha] of Object.entries(attuali)) if (!(key in salvate)) { salvate[key] = sha; aggiunte++; }
      // Le esistenti restano intatte: la generazione non è un modo per riscriverle.
      for (const key of Object.keys(prima)) expect(salvate[key]).toBe(prima[key]);
      const ordinate = Object.fromEntries(Object.keys(salvate).sort().map((k) => [k, salvate[k]]));
      writeFileSync(FIXTURE, JSON.stringify(ordinate, null, 2) + "\n");
      console.log(`impronte: +${aggiunte}, totali ${Object.keys(ordinate).length}`);
    });
    return;
  }

  it("nessun altro modello è cambiato", () => {
    const cambiati = Object.keys(salvate).filter((k) => k in attuali && attuali[k] !== salvate[k]);
    expect(cambiati, `Modelli cambiati (se voluto, aggiorna l'impronta a mano nel commit): ${cambiati.join(", ")}`).toEqual([]);
  });

  it("ogni modello esistente ha la sua impronta (dopo un lotto: IMPRONTE_NUOVE=1)", () => {
    const senza = MODULE68_MODELS.map((m) => m.key).filter((k) => !(k in salvate));
    expect(senza, `Modelli senza impronta: ${senza.join(", ")}`).toEqual([]);
  });

  it("nessuna impronta orfana", () => {
    const orfane = Object.keys(salvate).filter((k) => !(k in attuali));
    expect(orfane, `Impronte orfane (modello rimosso o rinominato?): ${orfane.join(", ")}`).toEqual([]);
  });
});
