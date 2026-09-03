/**
 * Ondata 4 — robustezza: stato di destinazione, modifica concorrente, cestino.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../../supabase/migrations");
const migrazione = (frammento: string): string => {
  const nome = readdirSync(DIR).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione non trovata: ${frammento}`);
  return readFileSync(resolve(DIR, nome), "utf8");
};
const sql = migrazione("robustezza_stati_versione_cestino");

describe("4 · lo stato di destinazione appartiene al percorso dell'azienda", () => {
  it("la ricerca dello stato è vincolata all'azienda della commessa", () => {
    expect(sql).toMatch(/WHERE id = p_new_status_id AND company_id = v_company_id/);
    expect(sql).toMatch(/stato di destinazione non valido per questa azienda/);
  });

  it("se il punto di innesto cambia, la migrazione si ferma invece di non fare nulla", () => {
    expect(sql).toMatch(/il punto di innesto non è stato trovato/);
  });
});

describe("4 · la modifica concorrente si vede", () => {
  it("chi manda una versione diversa da quella attuale viene fermato", () => {
    expect(sql).toMatch(/IF NEW\.version IS DISTINCT FROM OLD\.version THEN/);
    expect(sql).toMatch(/modificata da qualcun altro/);
    expect(sql).toMatch(/ERRCODE = '40001'/);   // serialization_failure
  });

  it("la versione sale da sola a ogni modifica", () => {
    expect(sql).toMatch(/NEW\.version := OLD\.version \+ 1;/);
  });

  it("è facoltativo: chi non manda la versione continua a funzionare", () => {
    // se il corpo non contiene `version`, NEW.version = OLD.version e non
    // scatta nulla: nessun percorso esistente si rompe
    expect(sql).toMatch(/facoltativo|non lo manda funziona come prima/i);
  });

  it("copre le entità principali", () => {
    expect(sql).toMatch(/ARRAY\['orders','quotes','profiles','documenti_fiscali'\]/);
  });
});

describe("4 · cancellazione reversibile per trenta giorni", () => {
  it("i clienti ora si possono cancellare senza perderli", () => {
    // orders, quotes, marketing_contacts e documenti_fiscali avevano già
    // deleted_at; profiles no: una cancellazione era definitiva
    expect(sql).toMatch(/ALTER TABLE public\.profiles ADD COLUMN IF NOT EXISTS deleted_at/);
    expect(sql).toMatch(/ALTER TABLE public\.profiles ADD COLUMN IF NOT EXISTS deleted_by/);
  });

  it("oltre i trenta giorni lo dichiara invece di fingere", () => {
    expect(sql).toMatch(/now\(\) - interval '30 days'/);
    expect(sql).toMatch(/non è più ripristinabile/);
  });

  it("chi cancella lo decide il server, non il client", () => {
    expect(sql).toMatch(/SET deleted_at = now\(\), deleted_by = \$2 WHERE id = \$1/);
    expect(sql).toMatch(/USING p_id, auth\.uid\(\)/);
  });

  it("solo le tabelle previste, e solo la propria azienda", () => {
    expect(sql).toMatch(/NOT IN \('orders','quotes','profiles','marketing_contacts'\)/);
    expect(sql).toMatch(/user_can_access_company\(v_company\) IS NOT TRUE/);
  });

  it("ripristinare qualcosa che non è nel cestino è un errore, non un successo", () => {
    expect(sql).toMatch(/questa riga non è nel cestino/);
  });
});

describe("4 · l'attore del cambio stato, fino in fondo", () => {
  it("anche lo storico prende l'attore da auth.uid()", () => {
    expect(sql).toMatch(/VALUES \(p_order_id, p_new_status_id, COALESCE\(auth\.uid\(\), p_changed_by\)\)/);
  });

  it("la migrazione verifica che non restino usi nudi del parametro", () => {
    expect(sql).toMatch(/restano usi nudi di p_changed_by/);
  });
});
