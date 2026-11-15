/**
 * Ogni commessa nasce col suo codice, da qualunque parte arrivi (15/11/2026).
 *
 * Il codice lo proponeva solo «Nuova commessa»: dal preventivo del committente, da «Nuovo lavoro»
 * col campo vuoto e dalle importazioni le commesse nascevano senza. Ora lo assegna un trigger
 * BEFORE INSERT su `orders` (20290331100000). Provato su Demo Azienda 2: vuoto → DEMO2-0011,
 * scritto a mano → resta quello.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(__dirname, "../../..", "supabase/migrations/20290331100000_commessa_codice_automatico.sql"),
  "utf8",
).replace(/--[^\n]*/g, "");

describe("Codice commessa automatico", () => {
  it("il trigger scatta prima di ogni inserimento in orders", () => {
    expect(sql).toMatch(/create trigger a_orders_codice_automatico\s+before insert on public\.orders\s+for each row/i);
  });

  it("riempie solo il codice vuoto: chi lo scrive a mano lo tiene", () => {
    expect(sql).toMatch(/coalesce\(btrim\(new\.order_code\), ''\) = ''/);
  });

  it("due inserimenti insieme non prendono lo stesso numero", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    // stable userebbe la fotografia presa prima del lock e non vedrebbe la commessa appena salvata.
    expect(sql).toMatch(/codice_commessa_libero[\s\S]*?language plpgsql\s+volatile/i);
  });

  it("le funzioni restano chiuse", () => {
    expect(sql).toMatch(/revoke all on function private\.codice_commessa_libero\(uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function private\.orders_codice_automatico\(\) from public, anon, authenticated/);
  });
});
