import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 5.7 — impronta e immutabilità sulle fatture ricevute.
 *
 * Provato su produzione e poi ripulito:
 *   impronta calcolata dal database e uguale allo SHA-256 del testo
 *   lo stesso file protocollato due volte → respinto per impronta
 *   xml_raw modificato → respinto (42501)
 *   xml_sha256 dettata dal chiamante → sovrascritta col valore vero
 *   busta base64 'MII…' → busta_firmata_non_verificata
 *   la verifica elenca tre cose che NON ha verificato
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("fattura_ricevuta_impronta"));
if (!nome) throw new Error("migrazione fattura_ricevuta_impronta non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("l'impronta la calcola il database", () => {
  it("è uno SHA-256 di xml_raw, preso dal server", () => {
    expect(sql).toMatch(/NEW\.xml_sha256 := encode\(extensions\.digest\(NEW\.xml_raw, 'sha256'\), 'hex'\)/);
  });

  it("il trigger sovrascrive sempre, quindi il chiamante non la detta", () => {
    const corpo = sql.slice(sql.indexOf("FUNCTION public.fattura_ricevuta_impronta"));
    expect(corpo).toMatch(/Anche l'impronta non si detta da fuori/);
    // nessun ramo che conservi un valore in arrivo
    expect(corpo).not.toMatch(/NEW\.xml_sha256 IS NOT NULL/);
  });

  it("scatta anche in UPDATE, non solo all'inserimento", () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.fatture_ricevute/);
  });
});

describe("il documento di un altro non si riscrive", () => {
  it("cambiare xml_raw è un errore, non una modifica", () => {
    expect(sql).toMatch(/NEW\.xml_raw IS DISTINCT FROM OLD\.xml_raw THEN/);
    expect(sql).toMatch(/ERRCODE = '42501'/);
  });

  it("il messaggio dice cosa fare invece", () => {
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /il fornitore emette una nota di credito: non la si riscrive qui/);
  });

  it("lo stesso file non si protocolla due volte", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_fatture_ricevute_impronta/);
    expect(sql).toMatch(/ON public\.fatture_ricevute \(company_id, xml_sha256\)/);
  });
});

describe("quello che non è verificato viene detto", () => {
  it("nessuno dei valori di firma_stato significa «valida»", () => {
    expect(sql).toMatch(/'busta_firmata_non_verificata'/);
    expect(sql).not.toMatch(/'firma_valida'|'verificata'/);
    expect(sql).toMatch(/nessuno dei tre significa «verificata»/);
  });

  it("la verifica elenca cosa resta fuori", () => {
    expect(sql).toMatch(/'non_verificato', jsonb_build_array\(/);
    expect(sql).toMatch(/la firma digitale non è validata/);
    expect(sql).toMatch(/non è confrontata con il registro imprese/);
  });

  it("è scritto perché la firma non si valida qui", () => {
    const testo = sql.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/Non è lavoro da plpgsql/);
    expect(testo).toMatch(/sarebbe peggio del niente che c'è adesso/);
  });

  it("senza XML lo dichiara invece di rispondere «intatta»", () => {
    expect(sql).toMatch(/'verificabile', false/);
    expect(sql).toMatch(/non c''è niente da confrontare/);
  });
});
