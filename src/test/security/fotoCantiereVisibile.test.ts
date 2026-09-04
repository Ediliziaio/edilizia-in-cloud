import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * foto_cantiere: la colonna che mancava.
 *
 * Provato su produzione e poi ripulito, con tre foto sulla stessa azienda:
 *   colonna nuova ............................ nasce false
 *   foto marcata visibile, sua commessa ...... il cliente la vede
 *   foto non marcata, sua commessa ........... non la vede
 *   foto marcata, commessa di un altro ....... non la vede
 *   staff .................................... le vede tutte e tre
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("foto_cantiere_visibile_cliente"));
if (!nome) throw new Error("migrazione foto_cantiere_visibile_cliente non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("la colonna non apre niente da sola", () => {
  it("nasce false e non è nullable", () => {
    expect(sql).toMatch(/visibile_cliente boolean NOT NULL DEFAULT false/);
  });

  it("il motivo è scritto, e non è una formalità", () => {
    expect(sql).toMatch(
      /può documentare un infortunio o un difetto, e il committente non deve vederla/);
  });
});

describe("la policy chiede due cose insieme", () => {
  it("la foto è marcata visibile", () => {
    expect(sql).toMatch(/visibile_cliente IS TRUE/);
  });

  it("e la commessa è del cliente che guarda", () => {
    expect(sql).toMatch(/o\.customer_id = \(SELECT auth\.uid\(\)\)/);
  });

  it("le due condizioni sono in AND, non in alternativa", () => {
    const pol = sql.slice(sql.indexOf("CREATE POLICY foto_cantiere_cliente_select"));
    expect(pol).toMatch(/visibile_cliente IS TRUE\s*\n\s*AND EXISTS/);
  });
});

describe("il portale non paga la scansione", () => {
  it("c'è un indice parziale sul caso che interrogherà", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_foto_cantiere_ordine_visibili/);
    expect(sql).toMatch(/WHERE visibile_cliente/);
  });
});
