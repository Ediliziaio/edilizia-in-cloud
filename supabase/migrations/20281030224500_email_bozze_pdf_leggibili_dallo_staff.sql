-- Bozze delle email: il PDF da cui nascono lo apre chi vede la bozza (30/10/2026).
--
-- L'estrazione degli allegati salva il PDF nel bucket email-attachments sotto la
-- cartella dell'AZIENDA (<company_id>/…: 158 bozze su 158 su produzione). Le policy
-- di quel bucket danno però la lettura solo a chi ha la cartella con il proprio id
-- utente (email_attachments_owner_read, pensata per gli allegati che uno scrive).
-- Così chi in ufficio deve confermare una bozza vede i campi letti dall'AI, la bozza
-- dice «controlla sull'anteprima», ma l'anteprima non c'è: nella schermata dell'email
-- gli allegati sono solo etichette, e dal browser il file non si apre.
--
-- Nuova policy di SOLA LETTURA: si apre il file che una bozza indica come suo
-- (email_documento_estratto.pdf_storage_path). Chi può vedere la bozza lo decide la
-- RLS della tabella (staff email della stessa azienda, utente non bloccato): la
-- policy non lo ripete, ci passa attraverso, perché la sottoquery gira con i
-- permessi di chi chiede.
--
-- Non cambia:
--   · nessuna policy esistente del bucket (owner_read/write/delete restano);
--   · gli altri file del bucket: se nessuna bozza li indica, restano chiusi come prima
--     (allegati scritti da un utente, allegati delle email in uscita, cartelle di altre aziende);
--   · scrittura e cancellazione;
--   · il server con la chiave di servizio, che non passa dalle policy.
-- Per tornare indietro: drop policy email_attachments_bozza_read on storage.objects;
--
-- Rilanciabile: CREATE INDEX IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE POLICY.

set local lock_timeout = '3s';

-- ── Guardia: la tabella ha le colonne e le policy del bucket sono quelle censite ──
do $guardia$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'email_documento_estratto' and column_name = 'pdf_storage_path'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'email_documento_estratto' and column_name = 'pdf_storage_bucket'
  ) then
    raise exception 'email_documento_estratto senza pdf_storage_bucket/pdf_storage_path: la migrazione va rivista';
  end if;
  if not exists (
    select 1 from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'email_attachments_owner_read'
  ) then
    raise exception 'Manca «email_attachments_owner_read» su storage.objects: il bucket non è più quello censito';
  end if;
end
$guardia$;

-- ── Il controllo ad ogni file passa da qui: serve l'indice sul percorso ─────────
create index if not exists idx_email_doc_estratto_pdf_path
  on public.email_documento_estratto (pdf_storage_path)
  where pdf_storage_path is not null;

-- ── La policy ───────────────────────────────────────────────────────────────
drop policy if exists email_attachments_bozza_read on storage.objects;
create policy email_attachments_bozza_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'email-attachments'
    and exists (
      select 1
        from public.email_documento_estratto d
       where d.pdf_storage_bucket = 'email-attachments'
         and d.pdf_storage_path = storage.objects.name
    )
  );

-- ── Verifica: la policy scritta dal database è quella voluta, le altre ci sono ──
do $verifica$
declare
  v_testo text;
  v_cmd "char";
begin
  select coalesce(pg_get_expr(p.polqual, p.polrelid), ''), p.polcmd
    into v_testo, v_cmd
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'email_attachments_bozza_read';
  if not found then
    raise exception 'email_attachments_bozza_read non è stata creata';
  end if;
  if v_cmd <> 'r' then
    raise exception 'email_attachments_bozza_read deve essere di sola lettura (SELECT), non %', v_cmd;
  end if;
  if v_testo !~ 'email-attachments' or v_testo !~ 'email_documento_estratto' or v_testo !~ 'pdf_storage_path' then
    raise exception 'email_attachments_bozza_read non è come prevista: %', v_testo;
  end if;
  if (select count(*) from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'storage' and c.relname = 'objects'
         and p.polname in ('email_attachments_owner_read', 'email_attachments_owner_write', 'email_attachments_owner_delete')) <> 3 then
    raise exception 'Le tre policy owner del bucket email-attachments dovevano restare';
  end if;
end
$verifica$;
