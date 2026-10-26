-- Le regole dei file per azienda leggevano l'azienda dal posto sbagliato (26/10/2026).
--
-- Sette regole di storage.objects confrontavano la cartella del file con `auth.jwt() -> 'raw_app_meta_data'
-- ->> 'company_id'`: quella chiave nel token non esiste (c'è `app_metadata`, e non porta l'azienda), il confronto
-- dava sempre «niente» e la regola non lasciava passare nessuno:
--   qp_upd   bucket quote-pdfs: riscrivere un PDF già salvato. Il PDF di un preventivo dei preventivatori edili ha
--            un percorso fisso per progetto (<azienda>/moduli/<modulo>-<progetto>.pdf) e si riscrive a ogni invio:
--            il PRIMO invio per la firma riusciva, il secondo («Invio non riuscito», HTTP 400 «new row violates
--            row-level security policy») no. Visto da Dimora Torino il 26/10 alle 12:53.
--   ca_*     bucket campaign-attachments (allegati delle campagne email): vuoto, nessun file è mai potuto entrare.
--   pna_*    bucket prima-nota-attachments (allegati della prima nota): vuoto, idem.
-- Le altre regole del bucket quote-pdfs (qp_sel, qp_ins, qp_del) usano get_my_company_id(): ora anche queste.
-- Stesso confine di prima, la cartella della propria azienda: non si apre niente a nessun altro.
set local lock_timeout = '3s';

drop policy if exists "qp_upd" on storage.objects;
create policy "qp_upd" on storage.objects for update to authenticated
  using (bucket_id = 'quote-pdfs' and (storage.foldername(name))[1] = (public.get_my_company_id())::text)
  with check (bucket_id = 'quote-pdfs' and (storage.foldername(name))[1] = (public.get_my_company_id())::text);

drop policy if exists "ca_sel" on storage.objects;
create policy "ca_sel" on storage.objects for select to authenticated
  using (bucket_id = 'campaign-attachments' and (storage.foldername(name))[1] = (public.get_my_company_id())::text);
drop policy if exists "ca_ins" on storage.objects;
create policy "ca_ins" on storage.objects for insert to authenticated
  with check (bucket_id = 'campaign-attachments' and (storage.foldername(name))[1] = (public.get_my_company_id())::text);
drop policy if exists "ca_del" on storage.objects;
create policy "ca_del" on storage.objects for delete to authenticated
  using (bucket_id = 'campaign-attachments' and (storage.foldername(name))[1] = (public.get_my_company_id())::text);

drop policy if exists "pna_sel" on storage.objects;
create policy "pna_sel" on storage.objects for select to authenticated
  using (bucket_id = 'prima-nota-attachments' and (storage.foldername(name))[1] = (public.get_my_company_id())::text);
drop policy if exists "pna_ins" on storage.objects;
create policy "pna_ins" on storage.objects for insert to authenticated
  with check (bucket_id = 'prima-nota-attachments' and (storage.foldername(name))[1] = (public.get_my_company_id())::text);
drop policy if exists "pna_del" on storage.objects;
create policy "pna_del" on storage.objects for delete to authenticated
  using (bucket_id = 'prima-nota-attachments' and (storage.foldername(name))[1] = (public.get_my_company_id())::text);
