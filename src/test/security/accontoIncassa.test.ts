import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * L'incasso dell'acconto che chiude la rata.
 *
 * Provato su uno scadenzario di prova 1.000 + 2.000 + 3.000, poi ripristinato:
 *   1.000 esatti ............. chiude la prima rata, una riga di prima nota
 *                              collegata all'installment_id
 *   stesso riferimento ....... rifiutato: «già registrato su questa commessa»
 *   500 su una rata da 2.000 . nessuna rata chiusa, ma i 500 restano in prima
 *                              nota come acconto non imputato, e la risposta
 *                              lo dice
 *   5.500 .................... chiude seconda e terza, residuo 500
 *   ordine ................... 1, 2, 3 tutte chiuse, in quest'ordine
 *   importo negativo ......... respinto
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("incasso_acconto_chiude_la_rata"));
if (!nome) throw new Error("migrazione incasso_acconto_chiude_la_rata non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("cassa e scadenzario si muovono insieme", () => {
  it("la rata si chiude e la prima nota si scrive nella stessa funzione", () => {
    const corpo = sql.slice(sql.indexOf("FOR r IN"));
    const posUpdate = corpo.indexOf("SET is_paid = true");
    const posInsert = corpo.indexOf("INSERT INTO public.prima_nota_entries");
    expect(posUpdate).toBeGreaterThan(0);
    expect(posInsert).toBeGreaterThan(posUpdate);
  });

  it("la riga di prima nota è collegata alla rata", () => {
    expect(sql).toMatch(/order_id, installment_id,/);
    expect(sql).toMatch(/p_order_id, r\.id, true, 'acconto_commessa'/);
  });
});

describe("quello che non si può rappresentare non si finge", () => {
  it("una rata si chiude solo se l'importo la copre tutta", () => {
    expect(sql).toMatch(/EXIT WHEN v_resta < coalesce\(r\.amount, 0\)/);
  });

  it("e il motivo è scritto", () => {
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /fingere che 500 su 1\.000 chiuda la rata sarebbe una bugia/);
  });

  it("il residuo si registra lo stesso, e la risposta lo dice", () => {
    expect(sql).toMatch(/Acconto non imputato a rata/);
    expect(sql).toMatch(/Nessuna rata chiusa: l''importo non copre per intero/);
    expect(sql).toMatch(/'residuo_non_imputato'/);
  });
});

describe("concorrenza e doppioni", () => {
  it("le rate si bloccano prima di toccarle", () => {
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /due incassi registrati insieme non devono chiudere la stessa rata due volte/);
  });

  it("lo stesso riferimento bancario non passa due volte", () => {
    expect(sql).toMatch(/e\.reference_number = btrim\(p_riferimento\)/);
    expect(sql).toMatch(/risulta già registrato su questa commessa/);
  });

  it("le rate si chiudono in ordine", () => {
    expect(sql).toMatch(/ORDER BY i\.position NULLS LAST, i\.expected_date NULLS LAST, i\.id/);
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /Un acconto non paga la terza rata lasciando aperta la prima/);
  });
});

describe("accesso e importi", () => {
  it("serve il permesso sui pagamenti", () => {
    expect(sql).toMatch(/assert_permesso\('can_manage_payments'/);
  });

  it("un importo non positivo è un errore", () => {
    expect(sql).toMatch(/l''importo dell''acconto deve essere positivo/);
  });
});
