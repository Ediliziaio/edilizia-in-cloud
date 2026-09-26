/**
 * Le schede tecniche allegate a un preventivo sono della sua azienda (26/09/2026).
 *
 * generate-quote-pdf unisce al PDF, col service role, i file dei materiali
 * collegati al preventivo. La policy di inserimento degli allegati controllava
 * solo il preventivo: con l'id di un materiale di un'altra azienda, il suo file
 * finiva nel proprio PDF. Ora un trigger lo rifiuta nel database e la funzione
 * unisce solo i materiali dell'azienda del preventivo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const migrazione = () => {
  const cartella = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(cartella).find((f) => f.endsWith("_allegati_preventivo_stessa_azienda.sql"));
  expect(file).toBeTruthy();
  return readFileSync(join(cartella, file!), "utf8");
};

describe("il database rifiuta l'allegato col materiale di un'altra azienda", () => {
  const sql = migrazione();

  it("un trigger su inserimento e cambio di preventivo o materiale, valido per chiunque scriva", () => {
    expect(sql).toContain("drop trigger if exists trg_allegato_preventivo_stessa_azienda on public.quote_pdf_attachments;");
    expect(sql).toContain("before insert or update of quote_id, material_id on public.quote_pdf_attachments");
    expect(sql).toContain("for each row execute function public.allegato_preventivo_stessa_azienda();");
  });

  it("confronta l'azienda del preventivo con quella del materiale e con la cartella del file", () => {
    expect(sql).toContain("select q.company_id into azienda_preventivo from public.quotes q where q.id = new.quote_id;");
    expect(sql).toContain("select m.company_id, m.storage_path into azienda_materiale, percorso_file");
    expect(sql).toContain("if azienda_preventivo is null or azienda_materiale is null or azienda_materiale <> azienda_preventivo");
    // Si scarica il percorso: anche il file deve stare nella cartella del preventivo, senza «..».
    expect(sql).toContain("or split_part(coalesce(percorso_file, ''), '/', 1) is distinct from azienda_preventivo::text");
    expect(sql).toContain("or position('..' in coalesce(percorso_file, '')) > 0 then");
    expect(sql).toContain("using errcode = '42501';");
  });

  it("gli allegati hanno la RESTRICTIVE sul blocco utente, come le altre tabelle", () => {
    expect(sql).toContain("drop policy if exists blocco_utente_bloccato on public.quote_pdf_attachments;");
    expect(sql).toMatch(/create policy blocco_utente_bloccato on public\.quote_pdf_attachments\s+as restrictive for all to authenticated/);
  });

  it("la funzione vede le due aziende (definer, search_path fisso) e nessuno la può chiamare", () => {
    expect(sql).toContain("create or replace function public.allegato_preventivo_stessa_azienda()");
    expect(sql).toMatch(/security definer\s+set search_path = public/);
    expect(sql).toContain("revoke all on function public.allegato_preventivo_stessa_azienda() from public, anon, authenticated;");
    expect(sql).toContain("set local lock_timeout = '3s';");
  });
});

describe("il PDF unisce solo le schede tecniche dell'azienda del preventivo", () => {
  const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");

  it("legge l'azienda del materiale e salta quelli di un'altra, e il file solo dalla cartella del preventivo", () => {
    expect(pdf).toContain('.select("*, quote_pdf_materials(name, storage_path, company_id)")');
    expect(pdf).toContain("if (att.quote_pdf_materials?.company_id !== quote.company_id) continue;");
    expect(pdf).toContain("const filePath = percorsoDellAzienda(att.quote_pdf_materials?.storage_path, quote.company_id);");
    // Il controllo viene prima del download dal contenitore dei materiali.
    expect(pdf.indexOf("if (att.quote_pdf_materials?.company_id !== quote.company_id) continue;"))
      .toBeLessThan(pdf.indexOf('supabaseAdmin.storage.from("quote-materials").download(filePath)'));
  });
});
