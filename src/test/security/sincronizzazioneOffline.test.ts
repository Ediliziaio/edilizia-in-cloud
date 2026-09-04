import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sincronizzazione offline idempotente.
 *
 * Provato su produzione e poi ripulito:
 *   invio con 4 operazioni ....... 1 inserita, 3 rifiutate col motivo
 *   lo STESSO invio ripetuto ..... 0 inserite, 2 già ricevute, stessi esiti
 *   timbrature in tabella ........ 1 sola (nessun doppione)
 *   foto senza storage_path ...... rifiutata: «la foto non è stata caricata»
 *   tipo inventato ............... rifiutato, elencando i cinque ammessi
 *   senza id_client .............. rifiutata: non sarebbe ripetibile
 *   201 operazioni ............... respinte in blocco
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("sincronizzazione_offline_idempotente"));
if (!nome) throw new Error("migrazione sincronizzazione_offline_idempotente non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");
const hook = readFileSync(
  resolve(__dirname, "../../hooks/campo/useOfflineSync.ts"), "utf8");

describe("il difetto che questa RPC chiude", () => {
  it("la coda del client rigioca ancora con insert semplici", () => {
    // Se un giorno il client passerà a sync_batch, questa prova va aggiornata:
    // serve a ricordare perché la RPC esiste.
    expect(hook).toMatch(/\.insert\(item\.payload\)/);
  });

  it("e accetta un nome di tabella dal telefono", () => {
    expect(hook).toMatch(/from\(item\.target\)/);
  });
});

describe("la chiave che rende il rinvio innocuo", () => {
  it("ogni operazione porta un id_client", () => {
    expect(sql).toMatch(/v_idc\s+:= nullif\(op ->> 'id_client', ''\)::uuid/);
  });

  it("senza id_client l'operazione è rifiutata", () => {
    expect(sql).toMatch(/senza una chiave l''operazione non può essere ripetibile/);
  });

  it("la chiave è unica per azienda", () => {
    expect(sql).toMatch(/PRIMARY KEY \(company_id, id_client\)/);
  });

  it("una ricevuta già presente si rilegge invece di rifare", () => {
    expect(sql).toMatch(/'gia_ricevuta', true/);
    expect(sql).toMatch(/Già ricevuta: si rilegge, non si rifà/);
  });

  it("anche il rifiuto viene registrato, altrimenti si ritenta all'infinito", () => {
    expect(sql).toMatch(/'rifiutata', left\(SQLERRM, 300\)/);
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /ritenterebbe per sempre un'operazione che non passerà mai/);
  });
});

describe("nessun nome di tabella arriva dal telefono", () => {
  it("i tipi ammessi sono cinque e scritti nel codice", () => {
    for (const t of ["timbratura", "rapportino_vocale", "checklist", "foto", "movimento_magazzino"]) {
      expect(sql).toContain(`WHEN '${t}' THEN`);
    }
  });

  it("un tipo fuori elenco è un errore che elenca quelli veri", () => {
    expect(sql).toMatch(/tipo non ammesso: %\. I tipi sono timbratura, rapportino_vocale, checklist, foto, movimento_magazzino/);
  });

  it("company_id e user_id li mette il server, non il payload", () => {
    const corpo = sql.slice(sql.indexOf("FOR op IN SELECT"));
    expect(corpo).toMatch(/VALUES \(v_company, v_uid,/);
    expect(corpo).not.toMatch(/v_dati ->> 'company_id'/);
    expect(corpo).not.toMatch(/v_dati ->> 'user_id'/);
  });
});

describe("i limiti dichiarati", () => {
  it("un invio è limitato a duecento operazioni", () => {
    expect(sql).toMatch(/jsonb_array_length\(p_operazioni\) > 200/);
    expect(sql).toMatch(/troppe operazioni in un solo invio/);
  });

  it("una foto senza percorso non diventa una riga vuota", () => {
    expect(sql).toMatch(/manca storage_path: la foto non è stata caricata/);
  });

  it("il movimento di magazzino passa dalla funzione transazionale dell'ondata 0.4", () => {
    expect(sql).toMatch(/PERFORM public\.warehouse_movimento_rapido\(/);
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /blocca la riga di giacenza e rifiuta di scendere sotto zero/);
  });

  it("la scelta di non fare tutto-o-niente è motivata", () => {
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /per una coda offline l'esito per elemento vale più del tutto-o-niente/);
  });
});
