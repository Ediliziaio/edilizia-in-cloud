/// <reference types="node" />
/**
 * Ogni azienda nuova nasce con 10 € di credito gratuito (27/10/2026), anche in prova.
 * Provato in produzione il 27/10: un'azienda creata in una transazione annullata aveva pool = email = AI = 10,
 * una riga di registro, servizio «omaggio_benvenuto».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20281027181000_omaggio_benvenuto_10_euro_nuove_aziende.sql"), "utf8").replace(/--.*$/gm, "");

describe("omaggio di benvenuto", () => {
  it("accredita 10 € dal portafoglio unico, con il servizio che lo distingue da una ricarica vera", () => {
    expect(sql).toContain("public.pool_ricarica(");
    expect(sql).toMatch(/new\.id, 'omaggio_benvenuto', 10,/);
  });
  it("una volta sola per azienda", () => {
    expect(sql).toMatch(/where l\.company_id = new\.id and l\.service = 'omaggio_benvenuto'/);
  });
  it("non blocca mai la creazione dell'azienda", () => {
    expect(sql).toMatch(/exception when others then[\s\S]*raise warning[\s\S]*return new;/);
  });
  it("parte dopo i trigger che creano i conti da specchiare, a ogni nuova azienda", () => {
    expect(sql).toMatch(/create trigger trg_omaggio_benvenuto_crediti\s+after insert on public\.companies\s+for each row/);
    // I trigger dello stesso evento partono in ordine alfabetico: il nostro deve seguire trg_init_*.
    expect("trg_omaggio_benvenuto_crediti" > "trg_init_whatsapp_credits").toBe(true);
    expect("trg_omaggio_benvenuto_crediti" > "t_company_credits").toBe(true);
  });
  it("la funzione non è chiamabile da fuori e la migrazione non aspetta i blocchi", () => {
    expect(sql).toContain("revoke all on function public.omaggio_benvenuto_crediti() from public, anon, authenticated;");
    expect(sql).toContain("set local lock_timeout = '3s';");
  });
});
