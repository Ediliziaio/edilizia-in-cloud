import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Il riepilogo del mattino.
 *
 * Provato su produzione e poi ripulito:
 *   scadenze ..................... 15 voci (il tetto), le più vecchie prime
 *   cantieri sotto soglia ........ 6, il peggiore primo: ORD-2026-008 a −11,80%
 *                                  con l'azione «Il cantiere è in perdita…»
 *   preventivi fermi ............. 0 sull'azienda demo — e non è un difetto:
 *                                  ha 8 preventivi, tutti in bozza senza sent_at
 *   costruiti due preventivi ..... uno scritto 'visto' e uno 'inviato': il
 *                                  normalizzatore li porta entrambi a 'inviata',
 *                                  e la funzione li trova entrambi
 *   azione differenziata ......... chi l'ha aperto → «chiama»; chi no →
 *                                  «fai un sollecito»
 *   finestra a 30 giorni ......... nessuno dei due è ancora fermo
 *   altra azienda ................ respinta
 *
 * Il corpo di questo file è stato confrontato col catalogo: tolti i commenti,
 * l'impronta è la stessa (d2dc21dc…).
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("riepilogo_del_mattino"));
if (!nome) throw new Error("migrazione riepilogo_del_mattino non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("completa il briefing che c'è, non lo sostituisce", () => {
  it("dice perché non è un secondo briefing", () => {
    const testo = sql.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/Non ne scrivo un secondo/);
    expect(testo).toMatch(/pre-crea le azioni in stato «da approvare»/);
  });

  it("dice perché sta nel database e non fra gli strumenti AI", () => {
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /non devono costare una chiamata a un modello per essere letti/);
  });
});

describe("le quattro sezioni", () => {
  it("ci sono tutte e portano un conteggio", () => {
    for (const s of [
      "scadenze_non_incassate", "cantieri_sotto_soglia",
      "preventivi_fermi", "messaggi_senza_risposta",
    ]) {
      expect(sql).toContain(`'${s}'`);
    }
    expect(sql).toMatch(/'quante', jsonb_build_object\(/);
  });

  it("ogni voce porta l'azione e la destinazione", () => {
    const azioni = sql.match(/'azione',/g) ?? [];
    const dove = sql.match(/'dove',/g) ?? [];
    expect(azioni.length).toBeGreaterThanOrEqual(4);
    expect(dove.length).toBeGreaterThanOrEqual(4);
  });

  it("ogni sezione ha un tetto", () => {
    const limiti = sql.match(/LIMIT \d+/g) ?? [];
    expect(limiti.length).toBeGreaterThanOrEqual(4);
  });
});

describe("le scadenze sono al netto degli storni", () => {
  it("sottrae le note di credito e scarta i tipi che non sono crediti", () => {
    expect(sql).toMatch(/public\.documento_stornato\(d\.id\)/);
    expect(sql).toMatch(/public\.documento_segno\(d\.tipo\) = 1/);
  });

  it("il motivo è scritto", () => {
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /sollecitarla è il modo migliore per perdere un cliente/);
  });
});

describe("i preventivi fermi, e il vocabolario doppio", () => {
  it("passa dal normalizzatore invece di elencare gli stati a mano", () => {
    expect(sql).toMatch(/public\.normalizza_stato_preventivo\(q\.status\) = 'inviata'/);
    expect(sql).not.toMatch(/q\.status IN \('inviato', 'visto'\)/);
  });

  it("«visto» si legge da viewed_at, non dallo stato", () => {
    expect(sql).toMatch(/'visto_dal_cliente', q\.viewed_at IS NOT NULL/);
    expect(sql).toMatch(/CASE WHEN q\.viewed_at IS NOT NULL/);
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /«visto» non è uno stato: il normalizzatore lo riporta a 'inviata'/);
  });
});

describe("accesso", () => {
  it("chiede a quale azienda appartiene chi chiama", () => {
    expect(sql).toMatch(/user_can_access_company\(p_company_id\) IS NOT TRUE/);
  });

  it("non è eseguibile da anon", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.riepilogo_mattino\(uuid, integer\) FROM PUBLIC, anon/);
  });
});
