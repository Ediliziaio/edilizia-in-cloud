// Test di contratto della migrazione
// `20290314090000_commessa_cliente_invariante_nel_db.sql`: legge il file SQL e
// tiene fermi i punti che, se saltano, riaprono il buco o rompono un uso
// legittimo. Non parla col database: controlla il testo della migrazione, che è
// l'unico posto dove l'invariante è scritta per intero.
//
// Perché ognuno di questi punti c'è, provato il 12/11/2026 su un'azienda demo
// in transazione annullata:
//  · senza il vincolo sulla tabella, `service_role` porta un'azienda a
//    commessa_cliente_attiva = false + modelli_attivi = '{}' con un solo
//    update, e in quello stato l'azienda non può più creare nessuna commessa;
//  · `array_length('{}', 1)` è NULL: scritto senza `coalesce`, il vincolo
//    passerebbe proprio nel caso che deve fermare;
//  · su `insert ... on conflict` il CHECK è controllato sulla riga PROPOSTA,
//    prima che Postgres veda il conflitto: se la insert porta un '{}' di
//    comodo, anche lo spegnimento legittimo fallisce (misurato: 23514 su un
//    caso che deve passare);
//  · il controllo deve stare PRIMA della scrittura, con la riga bloccata, se
//    no all'utente arriva il testo del vincolo invece del messaggio scritto a
//    mano, e due chiamate in parallelo non si mettono in fila.
//
// `EIC_MIGRAZIONI_DIR` serve solo per provare il test prima che la migrazione
// sia nel repository; in CI non è impostata e si legge `supabase/migrations`.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CARTELLA = "supabase/migrations";
const FINALE = "_commessa_cliente_invariante_nel_db.sql";

function leggiMigrazione(): string {
  const nomi = readdirSync(CARTELLA).filter((n) => n.endsWith(FINALE));
  expect(nomi, `manca la migrazione *${FINALE} in ${CARTELLA}`).toHaveLength(1);
  return readFileSync(join(CARTELLA, nomi[0]), "utf8");
}

/** Il corpo di una funzione, dal `create or replace function` al `$$;` che lo chiude. */
function corpoFunzione(sql: string, nome: string): string {
  const inizio = sql.indexOf(`create or replace function public.${nome}`);
  expect(inizio, `manca la funzione ${nome}`).toBeGreaterThan(-1);
  const resto = sql.slice(inizio);
  const fine = resto.search(/\n\$(function)?\$;/);
  expect(fine, `il corpo di ${nome} non si chiude`).toBeGreaterThan(-1);
  return resto.slice(0, fine);
}

const sql = leggiMigrazione();
const cliente = corpoFunzione(sql, "commesse_generali_commessa_cliente_salva");
const impostazioni = corpoFunzione(sql, "commesse_generali_impostazioni_salva");

describe("l'invariante «un modo di creare una commessa» sta nello schema", () => {
  it("il vincolo c'è e conta l'array con coalesce", () => {
    expect(sql).toMatch(
      /add constraint company_commesse_generali_un_modo_di_creare\s+check \(commessa_cliente_attiva or coalesce\(array_length\(modelli_attivi, 1\), 0\) > 0\)/,
    );
  });

  it("niente array_length senza coalesce: su '{}' vale NULL e il vincolo passerebbe", () => {
    const senzaCoalesce = /array_length\(modelli_attivi[^)]*\)\s*(>=|>|=)/g;
    for (const trovato of sql.matchAll(senzaCoalesce)) {
      expect(
        sql.slice(Math.max(0, trovato.index - 40), trovato.index),
        `confronto su array_length senza coalesce: ${trovato[0]}`,
      ).toMatch(/coalesce\($/);
    }
  });

  it("il vincolo si applica due volte senza rompere, e non blocca la produzione", () => {
    expect(sql).toMatch(/drop constraint if exists company_commesse_generali_un_modo_di_creare/);
    expect(sql.indexOf("drop constraint if exists")).toBeLessThan(sql.indexOf("add constraint"));
    expect(sql).toMatch(/set local lock_timeout = '3s'/);
  });

  it("il vincolo nasce not valid e poi viene validato", () => {
    expect(sql).toMatch(/\) not valid;/);
    expect(sql).toMatch(/validate constraint company_commesse_generali_un_modo_di_creare/);
  });
});

describe.each([
  ["commesse_generali_commessa_cliente_salva", cliente],
  ["commesse_generali_impostazioni_salva", impostazioni],
])("%s", (nome, corpo) => {
  it("chiede can_edit_settings_orders sull'azienda passata", () => {
    expect(corpo).toMatch(
      /has_permission_for_company\(auth\.uid\(\), 'can_edit_settings_orders', p_company_id\)/,
    );
    expect(corpo).toMatch(/auth\.uid\(\) is null/);
  });

  it("è security definer con search_path fissato", () => {
    expect(corpo).toMatch(/security definer/);
    expect(corpo).toMatch(/set search_path to 'public'/);
  });

  it("blocca la riga e controlla PRIMA di scrivere", () => {
    const perUpdate = corpo.indexOf("for update");
    const insert = corpo.indexOf("insert into public.company_commesse_generali_settings");
    const rifiuto = corpo.indexOf("using errcode = '23514'");
    expect(perUpdate, `${nome}: manca il select ... for update`).toBeGreaterThan(-1);
    expect(perUpdate).toBeLessThan(insert);
    expect(rifiuto, `${nome}: manca il rifiuto 23514`).toBeGreaterThan(-1);
    expect(rifiuto).toBeLessThan(insert);
  });

  it("la riga proposta alla insert è già valida da sola", () => {
    // Su insert ... on conflict il CHECK guarda la riga proposta.
    expect(corpo).not.toMatch(/values \(p_company_id, '\{\}', p_attiva/);
    expect(corpo).toMatch(/\(company_id, modelli_attivi, commessa_cliente_attiva, updated_by, updated_at\)/);
  });
});

describe("la commessa cliente passa dai valori di adesso", () => {
  it("cliente_salva propone i modelli già accesi, non un '{}' di comodo", () => {
    expect(cliente).toMatch(/values \(p_company_id, coalesce\(v_modelli, '\{\}'\), p_attiva/);
  });

  it("impostazioni_salva propone la commessa cliente di adesso", () => {
    expect(impostazioni).toMatch(/values \(p_company_id, v_modelli, coalesce\(v_cliente, true\)/);
  });

  it("riga assente = commessa cliente accesa e nessun modello", () => {
    expect(cliente).toMatch(/coalesce\(array_length\(v_modelli, 1\), 0\) = 0/);
    expect(impostazioni).toMatch(/not coalesce\(v_cliente, true\)/);
  });
});

describe("chi può chiamare le due RPC", () => {
  it.each([
    "commesse_generali_commessa_cliente_salva(uuid, boolean)",
    "commesse_generali_impostazioni_salva(uuid, text[])",
  ])("%s è chiusa a public e anon e aperta a authenticated", (firma) => {
    expect(sql).toContain(`revoke all on function public.${firma} from public`);
    expect(sql).toContain(`revoke all on function public.${firma} from anon`);
    expect(sql).toContain(`grant execute on function public.${firma} to authenticated`);
  });

  it("nessun grant ad anon in tutta la migrazione", () => {
    expect(sql).not.toMatch(/grant [^;]*to [^;]*anon/);
  });
});

describe("i messaggi restano quelli scritti a mano", () => {
  it("spegnere la commessa cliente senza generali", () => {
    expect(cliente).toContain("Prima accendi un tipo di commessa generale");
  });

  it("spegnere l'ultimo generale con la commessa cliente spenta", () => {
    expect(impostazioni).toContain("Prima riaccendi la commessa cliente");
  });

  it("il permesso che manca si dice in italiano", () => {
    expect(sql).toContain("Non hai il permesso di cambiare queste impostazioni.");
  });
});
