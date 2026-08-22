-- Documenti del personale: chi può caricarli e chi può aprirli.
--
-- Il fascicolo del dipendente vive in `hr_documenti` (bucket `hr-documenti`),
-- ed è quello che alimenta i badge scadenza, la scheda profilo e l'avviso
-- giornaliero hr-check-scadenze. Aveva però due porte chiuse:
--
--  1) SCRIVERE era riservato a company_admin/super_admin. L'impiegato che in
--     azienda tiene davvero il personale (company_staff) poteva vedere le
--     scadenze ma non caricare un documento: doveva chiedere al titolare.
--  2) LEGGERE il FILE era riservato agli stessi. Il dipendente aveva già la
--     policy self-read sulla RIGA, ma sullo storage no: vedeva "Visita medica,
--     scade il 30/09" e cliccando otteneva un errore. Il documento era suo e
--     non poteva aprirlo.
--
-- Path nel bucket: {company_id}/{hr_profilo_id}/{uuid}-{nome}, quindi la
-- seconda cartella identifica la persona ed è su quella che si verifica.

-- ── 1. La riga: anche company_staff gestisce il fascicolo ───────────────────
drop policy if exists hr_documenti_admin on public.hr_documenti;
create policy hr_documenti_admin on public.hr_documenti
  for all to authenticated
  using (
    company_id = public.get_my_company_id()
    and (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      or public.has_role(auth.uid(), 'company_staff'::app_role)
      or public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
  with check (
    company_id = public.get_my_company_id()
    and (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      or public.has_role(auth.uid(), 'company_staff'::app_role)
      or public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- ── 2. Il file: stesso allargamento lato storage ────────────────────────────
drop policy if exists hr_doc_storage_admin on storage.objects;
create policy hr_doc_storage_admin on storage.objects
  for all to authenticated
  using (
    bucket_id = 'hr-documenti'
    and (storage.foldername(name))[1] = (public.get_my_company_id())::text
    and (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      or public.has_role(auth.uid(), 'company_staff'::app_role)
      or public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
  with check (
    bucket_id = 'hr-documenti'
    and (storage.foldername(name))[1] = (public.get_my_company_id())::text
    and (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      or public.has_role(auth.uid(), 'company_staff'::app_role)
      or public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- ── 3. Il dipendente scarica i PROPRI documenti ─────────────────────────────
-- Sola lettura, e solo la cartella del proprio profilo HR.
drop policy if exists hr_doc_storage_self_read on storage.objects;
create policy hr_doc_storage_self_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hr-documenti'
    and (storage.foldername(name))[2] in (
      select hp.id::text from public.hr_profili hp where hp.user_id = auth.uid()
    )
  );

-- ── 4. documenti_operai: chiudere la porta lasciata aperta ──────────────────
-- La policy era `FOR ALL` con il solo vincolo di appartenere all'azienda:
-- qualunque operaio con un accesso poteva leggere — e cancellare — le visite
-- mediche e i documenti d'identità dei colleghi. La tabella è vuota su tutto
-- il database (il bucket `documenti-operai` non è mai stato creato, quindi
-- ogni caricamento falliva), ma la falla sarebbe scattata il giorno del primo
-- upload. La UI ora usa hr_documenti; qui restringiamo comunque a chi di
-- dovere, lasciando al diretto interessato la lettura dei propri.
drop policy if exists doc_operai_company_access on public.documenti_operai;
create policy doc_operai_company_access on public.documenti_operai
  for all to authenticated
  using (
    company_id = public.get_my_company_id()
    and (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      or public.has_role(auth.uid(), 'company_staff'::app_role)
      or public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
  with check (
    company_id = public.get_my_company_id()
    and (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      or public.has_role(auth.uid(), 'company_staff'::app_role)
      or public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );
-- `doc_operai_self_select` resta com'è: l'operaio vede i propri.

-- ── 5. Il catalogo tipi non deve avere doppioni ─────────────────────────────
-- Su Demo 2 il seed è passato due volte: 10 tipi diventati 20, e il menu a
-- tendina li mostrava tutti in coppia. Si tiene il più vecchio per nome.
delete from public.tipi_documento_operaio t
 where exists (
   select 1 from public.tipi_documento_operaio t2
    where t2.company_id = t.company_id
      and lower(t2.nome) = lower(t.nome)
      and (t2.created_at < t.created_at or (t2.created_at = t.created_at and t2.id < t.id))
 );

create unique index if not exists tipi_documento_operaio_company_nome_uidx
  on public.tipi_documento_operaio (company_id, lower(nome));
