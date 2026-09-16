-- Documenti dei contatti: lo staff poteva vederli ma non aggiungerli.
--
-- `marketing_documents` aveva lettura per lo staff con permesso e scrittura
-- solo per admin e super admin. Chi ha "modifica contatti" (Elena di Ener
-- Italia, call center) caricava il file nel bucket e poi la riga del documento
-- veniva rifiutata. Stessa regola delle policy dei contatti: chi li modifica
-- può aggiungere, cambiare e togliere i loro documenti.

drop policy if exists "Staff can manage marketing documents if permitted" on public.marketing_documents;

create policy "Staff can manage marketing documents if permitted" on public.marketing_documents
  for all to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_edit_marketing_contacts'))))
  with check (company_id in (select unnest(public.aziende_con_permesso('can_edit_marketing_contacts'))));
