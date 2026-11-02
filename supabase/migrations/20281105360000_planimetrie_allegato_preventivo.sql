-- La pianta come allegato del preventivo (fase 8 del piano delle planimetrie, 1/11/2026).
--
-- Gli allegati del preventivo sono schede in quote_pdf_materials con il file nel bucket quote-materials:
-- generate-quote-pdf li accoda al PDF. Dal browser oggi non si può né caricare il file né creare la scheda
-- (le schede le crea l'amministrazione). Si apre SOLO il caso della pianta:
--   - file in «<azienda>/planimetrie/<planimetria>-v<versione>-<istante>.pdf»;
--   - scheda con categoria «planimetria», creata da chi la carica, sullo stesso percorso;
--   - solo per le aziende in cui l'utente può modificare i preventivi (come le policy di quotes).
-- Collegarla al preventivo usa le regole che ci sono (quote_pdf_attachments, trigger stessa azienda).
-- Niente DROP: le policy nascono solo se mancano.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'planimetrie_allegati_insert') then
    create policy planimetrie_allegati_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'quote-materials'
        and name ~ '^[0-9a-f-]{36}/planimetrie/[0-9a-f-]{36}-v[0-9]+-[0-9]+\.pdf$'
        and not (select public.utente_bloccato())
        and (
          (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
          or (storage.foldername(name))[1]::uuid in (select unnest(public.aziende_con_permesso('can_edit_preventivi')))
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_pdf_materials' and policyname = 'qpm_ins_planimetria') then
    create policy qpm_ins_planimetria on public.quote_pdf_materials for insert to authenticated
      with check (
        category = 'planimetria'
        and created_by = (select auth.uid())
        and storage_path ~ '^[0-9a-f-]{36}/planimetrie/[0-9a-f-]{36}-v[0-9]+-[0-9]+\.pdf$'
        and split_part(storage_path, '/', 1) = company_id::text
        and not (select public.utente_bloccato())
        and (
          (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
          or company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi')))
        )
      );
  end if;
end $$;
