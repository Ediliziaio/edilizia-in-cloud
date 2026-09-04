import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 1.2 e 1.3 — meno policy per query, e le tredici richieste sotto i 300 ms.
 *
 * Misurato su produzione, prima e dopo:
 *   policy accorpate ......... 69 gruppi, 155 policy sostituite da 69
 *   tabelle con 4+ in lettura  71 → 43 (le restanti sono policy ALL)
 *   orders ................... 10 policy → 4;  order_items 9 → 5;  tasks 10 → 8
 *   equivalenza .............. 759 confronti su 11 utenti reali, 7 ruoli e
 *                              69 tabelle: 759 identici, 0 differenze
 *   tempi a caldo ............ scadenzario 306 → 267 ms · order_items 366 → 271
 *                              orders 107 → 94 · ricerca contatti 632 → 3,5 (RPC)
 *   tredici richieste ........ 13 su 13 sotto i 300 ms, la più lenta 271
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const leggi = (frammento: string) => {
  const nome = readdirSync(dir).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione ${frammento} non trovata`);
  return readFileSync(resolve(dir, nome), "utf8");
};

const accorpa = leggi("policy_di_lettura_accorpate");
const veloce = leggi("lettura_ordini_meno_cara");

describe("accorpare è sicuro solo a tre condizioni", () => {
  it("solo policy permissive", () => {
    expect(accorpa).toMatch(/AND p\.polpermissive/);
    expect(accorpa.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /una RESTRICTIVE si somma in AND/);
  });

  it("solo SELECT, mai le policy ALL", () => {
    expect(accorpa).toMatch(/AND p\.polcmd = 'r'/);
    expect(accorpa).toMatch(/AND p\.polwithcheck IS NULL/);
    expect(accorpa.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /mescolarla regalerebbe permessi di scrittura/);
  });

  it("solo a parità di ruoli", () => {
    expect(accorpa).toMatch(/GROUP BY 1\s*\n\s*HAVING count\(\*\) >= 2/);
    expect(accorpa.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /altrimenti ogni gruppo eredita i permessi dell'altro/);
  });

  it("copia in zz_policy_backup prima di togliere", () => {
    const corpo = accorpa.slice(accorpa.indexOf("LOOP"));
    const posBackup = corpo.indexOf("INSERT INTO public.zz_policy_backup");
    const posDrop = corpo.indexOf("DROP POLICY %I");
    expect(posBackup).toBeGreaterThan(0);
    expect(posDrop).toBeGreaterThan(posBackup);
  });
});

describe("il difetto che la funzione ha avuto", () => {
  it("il nome porta il gruppo di ruoli", () => {
    expect(accorpa).toMatch(/'_lettura_' \|\| v_sfx/);
    expect(accorpa).toMatch(/WHEN g\.ruoli = '' THEN 'public'/);
  });

  it("e non sovrascrive una policy che non ha creato lei", () => {
    expect(accorpa).toMatch(/non la sovrascrivo/);
    expect(accorpa).not.toMatch(/DROP POLICY IF EXISTS %I ON %s', v_nome/);
  });

  it("la storia dell'errore è scritta, non nascosta", () => {
    const testo = accorpa.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/tre policy di lettura sparite in silenzio/);
    expect(testo).toMatch(/Ricostruite da `zz_policy_backup`/);
  });
});

describe("le due correzioni di prestazione", () => {
  it("niente RLS annidato: si chiede l'azienda a una funzione, non a orders", () => {
    expect(veloce).toMatch(/user_can_read_accountant_company\(get_order_company_id\(order_id\)\)/);
    expect(veloce.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /leggere `orders` dentro una policy fa applicare a `orders` tutto il SUO RLS/);
  });

  it("i rami dell'OR vanno dal più economico al più caro", () => {
    const corpo = veloce.slice(veloce.indexOf("ALTER POLICY orders_lettura"));
    const posColonna = corpo.indexOf("customer_id = (SELECT auth.uid())");
    const posFunzione = corpo.indexOf("order_has_employee_for_user");
    expect(posColonna).toBeGreaterThan(0);
    expect(posFunzione).toBeGreaterThan(posColonna);
  });

  it("è scritto perché l'ordine conta, visto che la condizione non cambia", () => {
    const testo = veloce.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/L'OR è commutativo: la condizione non cambia di una virgola/);
    expect(testo).toMatch(/si ferma al primo vero/);
  });

  it("sulla ricerca contatti non c'è niente da correggere: c'è da usare la RPC", () => {
    expect(veloce.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /Non c'è niente da correggere qui: c'è da usarla/);
  });
});
