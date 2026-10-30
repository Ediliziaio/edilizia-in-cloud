/**
 * Il PDF di una bozza lo apre chi vede la bozza (migrazione 20281030224500, 30/10/2026).
 *
 * L'estrazione degli allegati salva il PDF sotto la cartella dell'AZIENDA del bucket
 * email-attachments, ma le policy del bucket davano la lettura solo a chi ha la cartella con il
 * proprio id utente: chi doveva confermare una bozza non poteva aprirne il PDF. La policy nuova è
 * di SOLA LETTURA e passa dalla RLS della tabella delle bozze. Provata su produzione in una
 * transazione annullata: apre solo i file di bozze visibili all'utente (14 casi, vedi la nota).
 * Qui si tiene fermo che il file della migrazione non diventi più largo di così.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20281030224500_email_bozze_pdf_leggibili_dallo_staff.sql"),
  "utf8",
);
/** Il codice, senza i commenti di riga. */
const codice = sql
  .split("\n")
  .filter((r) => !r.trim().startsWith("--"))
  .join("\n");
const creazione = codice.slice(codice.indexOf("create policy"), codice.indexOf(";", codice.indexOf("create policy")));

describe("policy email_attachments_bozza_read", () => {
  it("è una sola policy, di sola lettura, per gli utenti autenticati", () => {
    expect(codice.match(/create policy/gi)).toHaveLength(1);
    expect(creazione).toMatch(/create policy email_attachments_bozza_read on storage\.objects/);
    expect(creazione).toMatch(/for select to authenticated/);
    expect(creazione).not.toMatch(/for (all|insert|update|delete)/i);
    expect(creazione).not.toMatch(/with check/i);
    expect(creazione).not.toMatch(/\bto (public|anon)\b/i);
  });

  it("apre solo il file che una bozza indica come suo, nel bucket giusto", () => {
    expect(creazione).toContain("bucket_id = 'email-attachments'");
    expect(creazione).toMatch(/from public\.email_documento_estratto d/);
    expect(creazione).toContain("d.pdf_storage_bucket = 'email-attachments'");
    expect(creazione).toContain("d.pdf_storage_path = storage.objects.name");
  });

  it("non allarga con un controllo sulla cartella o sul ruolo: la visibilità la decide la RLS della bozza", () => {
    expect(creazione).not.toMatch(/foldername|company_id|get_my_company_id|get_effective_company_id|is_email_staff_interno/);
  });

  it("l'unica policy che toglie è la propria; le tre dell'utente restano", () => {
    const tolte = [...codice.matchAll(/drop policy (?:if exists )?(\w+)/gi)].map((m) => m[1]);
    expect(tolte).toEqual(["email_attachments_bozza_read"]);
    expect(codice).not.toMatch(/alter policy/i);
    expect(codice).toContain("email_attachments_owner_read");
  });

  it("ha l'indice sul percorso (il controllo gira per ogni file) e la guardia e la verifica", () => {
    expect(codice).toMatch(/create index if not exists idx_email_doc_estratto_pdf_path[\s\S]*pdf_storage_path/);
    expect(codice).toContain("$guardia$");
    expect(codice).toContain("$verifica$");
    expect(codice).toMatch(/set local lock_timeout/);
    // la verifica rifiuta una policy che non sia di sola lettura
    expect(codice).toMatch(/v_cmd <> 'r'/);
  });

  it("si può rilanciare", () => {
    expect(codice).toMatch(/drop policy if exists email_attachments_bozza_read/);
    expect(codice).toMatch(/create index if not exists/);
  });
});
