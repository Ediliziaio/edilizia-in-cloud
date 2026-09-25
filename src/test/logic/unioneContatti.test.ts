/**
 * Unione di due contatti (25/09/2026): quello che è legato al doppione passa
 * al contatto che resta, in una transazione sola, nel database.
 *
 * Prima ContactMergeDialog spostava dal browser cinque tabelle e cancellava il
 * doppione. I WhatsApp (whatsapp_messages.contact_id, senza FK) restavano
 * legati a un contatto che non c'era più e sparivano dalla scheda e da
 * Conversazioni; email delle campagne, documenti, liste e campi personalizzati
 * si cancellavano col doppione (CASCADE); preventivi, fatture e attività
 * restavano senza contatto (SET NULL).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("ContactMergeDialog: l'unione la fa il database", () => {
  const src = leggi("src/components/marketing/ContactMergeDialog.tsx");
  const unione = src.slice(src.indexOf("const mergeContacts = useMutation"), src.indexOf("onSuccess:"));

  it("una chiamata sola a unisci_contatti_marketing, con chi resta e chi va", () => {
    expect(unione).toMatch(
      /supabase\.rpc\("unisci_contatti_marketing" as never, \{\s*p_tieni: keepId,\s*p_togli: removeId,\s*\} as never\)/,
    );
    expect(unione).toContain("if (error) throw error;");
  });

  it("il browser non sposta più le tabelle una per una e non cancella il contatto", () => {
    expect(unione).not.toContain("update({ contact_id");
    expect(unione).not.toMatch(/\.delete\(\)/);
  });

  it("dopo l'unione si rileggono le query del contatto che resta (cronologia, WhatsApp)", () => {
    expect(src).toContain("predicate: (q) => q.queryKey.includes(result.keepId)");
  });
});

describe("migrazione: unisci_contatti_marketing", () => {
  const cartella = join(process.cwd(), "supabase/migrations");
  const sql = readdirSync(cartella)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .map((f) => readFileSync(join(cartella, f), "utf8"))
    .find((s) => s.includes("create or replace function public.unisci_contatti_marketing(")) ?? "";
  const corpo = sql.slice(sql.indexOf("create or replace function public.unisci_contatti_marketing("));
  const primoSpostamento = corpo.indexOf("execute format('update");

  it("security definer, chiusa ad anon, concessa agli utenti", () => {
    expect(corpo).toMatch(/security definer\s+set search_path = public/);
    expect(sql).toContain("revoke all on function public.unisci_contatti_marketing(uuid, uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.unisci_contatti_marketing(uuid, uuid) to authenticated;");
  });

  it("controlla chi chiama come le policy dei contatti, prima di spostare qualcosa", () => {
    for (const controllo of [
      "if v_uid is null then",
      "'I due contatti sono di aziende diverse'",
      "public.utente_bloccato()",
      "public.aziende_con_permesso('can_edit_marketing_contacts')",
      "public.utente_sola_lettura(v_azienda)",
      "public.solo_assegnati_attivo()",
    ]) {
      const dove = corpo.indexOf(controllo);
      expect(dove, controllo).toBeGreaterThan(-1);
      expect(dove, controllo).toBeLessThan(primoSpostamento);
    }
  });

  it("le tabelle con una FK verso i contatti le trova nel catalogo", () => {
    expect(corpo).toContain("con.confrelid = 'public.marketing_contacts'::regclass");
  });

  it("le tabelle senza FK sono elencate, i WhatsApp per primi", () => {
    for (const tabella of [
      "whatsapp_messages",
      "openwa_messages",
      "whatsapp_broadcast_recipients",
      "human_call_logs",
      "sr_progetti",
      "conversazioni",
      "notifications",
    ]) {
      expect(corpo).toMatch(new RegExp(`\\('${tabella}',`));
    }
  });

  it("solo le righe della stessa azienda, e i doppioni di un indice unico restano al doppione", () => {
    expect(corpo).toContain("format(' and t.company_id = %L', v_azienda)");
    expect(corpo).toContain("and i.indisunique");
    expect(corpo).toContain("' and not exists (select 1 from %s d where d.%I = $1%s)'");
  });

  it("il doppione si cancella solo dopo aver spostato tutto", () => {
    expect(corpo.indexOf("delete from public.marketing_contacts where id = p_togli;")).toBeGreaterThan(primoSpostamento);
  });

  it("chi ha scritto STOP o si è disiscritto resta fuori anche dopo l'unione", () => {
    expect(corpo).toContain("optout_whatsapp = case when v_togli.optout_whatsapp then true else c.optout_whatsapp end");
    expect(corpo).toContain("unsubscribed    = c.unsubscribed or v_togli.unsubscribed");
  });

  it("«Unito il doppione» va nella cronologia ma non conta come lavoro sul contatto", () => {
    expect(corpo).toContain("'contact_merged'");
    expect(sql).toMatch(/when p_tipo in \([^)]*'contact_merged'\) then false/);
  });
});
