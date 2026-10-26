/**
 * Le regole dei file per azienda (26/10/2026): sette regole leggevano l'azienda da una chiave del token che non esiste
 * (`raw_app_meta_data`), e non lasciavano passare nessuno. Per i preventivi dei preventivatori edili voleva dire che il
 * primo invio per la firma riusciva e il secondo no (il PDF ha un percorso fisso e si riscrive).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const cartella = resolve(process.cwd(), "supabase/migrations");
const file = "20281026140000_storage_regole_azienda_dal_profilo.sql";
const sql: string = readFileSync(resolve(cartella, file), "utf8");

describe("migrazione storage_regole_azienda_dal_profilo", () => {
  it("riscrive le sette regole, tutte sull'azienda del profilo e nessuna sul token", () => {
    for (const nome of ["qp_upd", "ca_sel", "ca_ins", "ca_del", "pna_sel", "pna_ins", "pna_del"]) {
      expect(sql, nome).toContain(`drop policy if exists "${nome}" on storage.objects;`);
      expect(sql, nome).toContain(`create policy "${nome}" on storage.objects`);
    }
    const codice = sql.split("\n").filter((r) => !r.trim().startsWith("--")).join("\n");
    expect(codice).not.toContain("raw_app_meta_data");
    expect((codice.match(/public\.get_my_company_id\(\)/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it("la riscrittura dei PDF (qp_upd) vale solo per la cartella della propria azienda, in lettura e in scrittura", () => {
    const qp = sql.slice(sql.indexOf('create policy "qp_upd"'), sql.indexOf('drop policy if exists "ca_sel"'));
    expect(qp).toContain("for update to authenticated");
    expect(qp).toContain("using (bucket_id = 'quote-pdfs'");
    expect(qp).toContain("with check (bucket_id = 'quote-pdfs'");
  });

  it("non lascia nessun'altra migrazione recente a rimettere la chiave sbagliata", () => {
    const recenti = readdirSync(cartella).filter((f) => f >= "20281026");
    for (const f of recenti) {
      const codice = readFileSync(resolve(cartella, f), "utf8").split("\n").filter((r) => !r.trim().startsWith("--")).join("\n");
      expect(codice, f).not.toContain("raw_app_meta_data");
    }
  });
});
