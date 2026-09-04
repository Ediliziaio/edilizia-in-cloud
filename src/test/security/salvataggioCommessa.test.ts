import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Salvare una commessa era venti mosse in fila.
 *
 * Provato su produzione con una commessa usa-e-getta, poi ripulita.
 *
 *   primo salvataggio ................ 2 rate, 2 voci, 1 movimento
 *   colonne appiattite ............... 3000,00 / 7000,00 / true, ricavate dalle rate
 *   giacenza dopo scarico di 5 ....... 95
 *   provvigione ...................... 500,00, messa dal trigger e non da me
 *   secondo salvataggio .............. 1 voce aggiornata, 1 rimossa
 *   giacenza dopo il rientro di 3 .... 98
 *   rate con p_rate = null ........... 2, intatte
 *
 * Rifiuti, tutti verificati:
 *   balance_amount passato a mano / campo fuori elenco / voce di un'altra
 *   commessa / commission_amount imposto dal client.
 *
 * Atomicità, il guasto che il briefing citava per nome — rate cancellate e mai
 * reinserite. Rate nuove valide più una voce con fornitore inesistente, così la
 * chiave esterna salta DOPO la sostituzione delle rate:
 *   la chiamata fallisce ............. violates foreign key constraint
 *   rate rimaste ..................... 2
 *   e sono ancora quelle vecchie ..... «Acconto originale + Saldo originale»
 *   voci create dal tentativo ........ 0
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("salvataggio_commessa_in_una_transazione"));
if (!nome) throw new Error("migrazione salvataggio_commessa_in_una_transazione non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("una commessa si salva in un colpo solo", () => {
  it("è una funzione sola, non venti chiamate", () => {
    expect(sql).toMatch(/create or replace function public\.commessa_salva\(/);
    expect(sql).toMatch(/p_commessa\s+uuid,[\s\S]*p_campi\s+jsonb[\s\S]*p_rate\s+jsonb[\s\S]*p_bonus\s+jsonb[\s\S]*p_voci\s+jsonb[\s\S]*p_venditore jsonb/);
  });

  it("apre bloccando la riga, così due salvataggi si mettono in fila", () => {
    expect(sql).toMatch(/from public\.orders o where o\.id = p_commessa for update/);
  });

  it("chiede azienda e permesso prima di scrivere", () => {
    const testa = sql.slice(0, sql.indexOf("if p_campi is not null"));
    expect(testa).toMatch(/user_can_access_company\(v_company\) is not true/);
    expect(testa).toMatch(/assert_permesso\('can_edit_orders'/);
  });

  it("NULL vuol dire «non toccare», per ogni pezzo", () => {
    for (const arg of ["p_campi", "p_rate", "p_bonus", "p_voci", "p_venditore"]) {
      expect(sql).toMatch(new RegExp(`if ${arg} is not null then`));
    }
  });
});

describe("quello che il server non lascia scrivere al client", () => {
  it("le colonne appiattite si ricavano dalle rate", () => {
    expect(sql).toMatch(/c_derivate\s+text\[\] := array\[/);
    for (const c of ["deposit_amount", "balance_amount", "financing_amount", "deposit_2_amount"]) {
      expect(sql).toMatch(new RegExp(`'${c}'`));
    }
    expect(sql).toMatch(/si ricava dalle rate, non si scrive a mano/);
  });

  it("un campo fuori elenco viene detto, non ignorato in silenzio", () => {
    expect(sql).toMatch(/campo non scrivibile da qui: %/);
  });

  it("lo stato non passa di qui: ha la sua funzione che verifica il percorso", () => {
    const elenco = sql.slice(sql.indexOf("c_ammesse"), sql.indexOf("c_derivate"));
    expect(elenco).not.toMatch(/current_status_id/);
  });

  it("la provvigione la calcola il trigger, e passarla è un errore", () => {
    expect(sql).toMatch(/la provvigione la calcola il server, non passare commission_amount/);
    expect(sql).toMatch(/commission_amount\)\s*\n\s*values \(p_commessa, v_vend, v_ctipo, v_cval, 0\)/);
  });

  it("il tipo provvigione è quello ammesso dal vincolo, non uno inventato", () => {
    expect(sql).toMatch(/not in \('fixed','percentage_sold','percentage_collected'\)/);
  });

  it("un venditore di un'altra azienda non si aggancia", () => {
    expect(sql).toMatch(/venditore inesistente o di un''altra azienda/);
  });

  it("una voce di un'altra commessa non si adotta passandone l'id", () => {
    expect(sql).toMatch(/una delle voci non appartiene a questa commessa/);
  });
});

describe("la giacenza la muove il database, non il browser", () => {
  it("è un solo aggiornamento relativo, non leggi-calcola-riscrivi", () => {
    expect(sql).toMatch(/set quantity = greatest\(0, ws\.quantity - r\.delta\)/);
    expect(sql).not.toMatch(/select quantity into .* from public\.warehouse_stock/);
  });

  it("il delta nasce dal confronto fra quello che c'è e quello che arriva", () => {
    expect(sql).toMatch(/coalesce\(d\.q, 0\) - coalesce\(p\.q, 0\)/);
    expect(sql).toMatch(/where coalesce\(d\.q, 0\) <> coalesce\(p\.q, 0\)/);
  });

  it("il movimento si scrive solo se la giacenza è stata davvero toccata", () => {
    expect(sql).toMatch(/if found then\s*\n\s*insert into public\.warehouse_movements/);
  });

  it("l'articolo dev'essere della stessa azienda", () => {
    expect(sql).toMatch(/where ws\.id = r\.stock_item_id and ws\.company_id = v_company/);
  });

  it("l'autore del movimento è l'utente vero, non un segnaposto", () => {
    expect(sql).toMatch(/v_attore := auth\.uid\(\);/);
    expect(sql).toMatch(/serve un utente autenticato/);
    expect(sql).not.toMatch(/00000000-0000-0000-0000-000000000000/);
  });
});

describe("chi può chiamarla", () => {
  it("non è aperta a tutti", () => {
    expect(sql).toMatch(/revoke all on function public\.commessa_salva\(uuid, jsonb, jsonb, jsonb, jsonb, jsonb\) from public/);
    expect(sql).toMatch(/grant execute on function public\.commessa_salva\(uuid, jsonb, jsonb, jsonb, jsonb, jsonb\) to authenticated/);
  });

  it("anon non compare fra chi la può eseguire", () => {
    const grant = sql.slice(sql.indexOf("grant execute on function public.commessa_salva"));
    expect(grant.split("\n")[0]).not.toMatch(/anon/);
  });
});
