/**
 * Riferimenti PA della commessa: l'ufficio è della stessa azienda (guardiano degli accessi,
 * 15/11/2026). La chiave esterna ufficio_id → anagrafica_uffici_pa si controlla senza regole
 * d'accesso: senza questo controllo un'azienda poteva agganciare a un suo riferimento l'ufficio
 * PA di un'altra (provato in una transazione annullata: riuscito prima, rifiutato dopo).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20290410300300_order_riferimenti_pa_ufficio_stessa_azienda.sql"),
  "utf8",
);
const corpo = sql.slice(
  sql.indexOf("function public.order_riferimenti_pa_normalizza()"),
  sql.indexOf("$$;", sql.indexOf("function public.order_riferimenti_pa_normalizza()")),
);

describe("order_riferimenti_pa: ufficio della stessa azienda", () => {
  it("il trigger rifiuta un ufficio che non è dell'azienda della commessa", () => {
    expect(corpo).toMatch(/new\.ufficio_id is not null and not exists \(/);
    expect(corpo).toMatch(/from public\.anagrafica_uffici_pa u\s+where u\.id = new\.ufficio_id and u\.company_id = new\.company_id/);
    expect(corpo).toMatch(/using errcode = '23503'/);
  });

  it("il controllo viene dopo che company_id è preso dalla commessa, non dal browser", () => {
    const azienda = corpo.indexOf("select o.company_id into new.company_id from public.orders o where o.id = new.order_id");
    const ufficio = corpo.indexOf("new.ufficio_id is not null");
    expect(azienda).toBeGreaterThan(-1);
    expect(ufficio).toBeGreaterThan(azienda);
  });

  it("un solo messaggio per «non esiste» e «è di un'altra azienda»", () => {
    expect(corpo).not.toMatch(/raise exception[^;]*new\.ufficio_id/);
  });

  it("definer (legge uffici e commesse che l'utente non vede) con search_path vuoto, chiusa a tutti", () => {
    expect(corpo).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toContain("revoke all on function public.order_riferimenti_pa_normalizza() from public, anon, authenticated;");
  });

  it("la normalizzazione di prima resta", () => {
    for (const pezzo of ["new.cig :=", "new.cup :=", "new.codice_univoco_ufficio :=", "new.numero :=", "new.cig_motivo_esclusione :=", "new.updated_at := now()"]) {
      expect(corpo).toContain(pezzo);
    }
  });

  it("prudente sui lock", () => {
    expect(sql).toContain("set local lock_timeout = '3s';");
  });
});
