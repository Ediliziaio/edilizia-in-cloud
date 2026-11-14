/**
 * Ogni errore di permesso dice il permesso (14/11/2026, regola del titolare).
 * Le due migrazioni applicate quel giorno, lette come contratto.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leggi = (f: string) => readFileSync(`supabase/migrations/${f}`, "utf8");

describe("Dati protetti: niente più scarti in silenzio", () => {
  const sql = leggi("20290317130001_dati_protetti_dicono_il_permesso.sql");
  it("un valore nuovo senza il diritto si rifiuta col nome del permesso", () => {
    expect(sql).toMatch(/raise exception ''Il dato «%» lo cambia solo chi ha il permesso «%»/);
    expect(sql).toContain("Venduto e importi");
    expect(sql).toContain("using errcode=''42501''");
  });
  it("vuoto o uguale al salvato passa come prima, senza scrivere", () => {
    expect(sql).toContain("(changed->protected.column_name) = (before_row->protected.column_name)");
    expect(sql).toContain("''null''::jsonb,''false''::jsonb,''0''::jsonb");
  });
  it("si ferma se il punto da sostituire non c'è, invece di fare a metà", () => {
    expect(sql).toContain("punto da sostituire non trovato");
  });
});

describe("Import delle fasi da computo o preventivo", () => {
  const sql = leggi("20290317130002_commessa_importa_fasi.sql");
  it("chiusa ad anon, aperta a chi è collegato, col permesso Ordini e Commesse", () => {
    expect(sql).toContain("revoke all on function public.commessa_importa_fasi(uuid, jsonb, text, text) from public, anon;");
    expect(sql).toContain("grant execute on function public.commessa_importa_fasi(uuid, jsonb, text, text) to authenticated;");
    expect(sql).toMatch(/can_edit_orders[\s\S]*Chiedi al titolare/);
  });
  it("gli importi solo con «Venduto e importi»; le fasi già presenti si saltano", () => {
    expect(sql).toContain("'can_view_order_amounts'");
    expect(sql).toContain("v_saltate := v_saltate + 1;");
  });
});
