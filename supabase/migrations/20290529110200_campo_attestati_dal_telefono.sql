drop policy if exists hr_documenti_self_insert on public.hr_documenti;
create policy hr_documenti_self_insert on public.hr_documenti for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and categoria in ('corso_sicurezza', 'visita_medica', 'idoneita', 'patente', 'documento_identita', 'permesso_soggiorno', 'altro')
    and exists (
      select 1 from public.hr_profili hp
       where hp.id = hr_documenti.hr_profilo_id
         and hp.user_id = (select auth.uid())
         and hp.company_id = hr_documenti.company_id
    )
  );
drop policy if exists hr_doc_storage_self_insert on storage.objects;
create policy hr_doc_storage_self_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hr-documenti'
    and exists (
      select 1 from public.hr_profili hp
       where hp.user_id = (select auth.uid())
         and (storage.foldername(name))[1] = hp.company_id::text
         and (storage.foldername(name))[2] = hp.id::text
    )
  );
create or replace function public.hr_documento_caricato_da_operaio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome text;
begin
  if new.created_by is null or not exists (
    select 1 from public.hr_profili hp where hp.id = new.hr_profilo_id and hp.user_id = new.created_by
  ) then
    return new;
  end if;
  begin
    select coalesce(nullif(btrim(coalesce(hp.nome, '') || ' ' || coalesce(hp.cognome, '')), ''), 'Un operaio')
      into v_nome from public.hr_profili hp where hp.id = new.hr_profilo_id;
    perform public.create_notification(new.company_id, ur.user_id, 'hr_documento_operaio',
      'Documento da controllare · ' || v_nome,
      left(coalesce(new.titolo, replace(new.categoria, '_', ' '))
        || coalesce(' · scade il ' || to_char(new.data_scadenza, 'DD/MM/YYYY'), ''), 300),
      'hr_documento', new.id, '/azienda/personale?tab=documenti')
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.company_id = new.company_id
    where ur.role = 'company_admin' and ur.user_id <> new.created_by;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke all on function public.hr_documento_caricato_da_operaio() from public, anon;
drop trigger if exists trg_hr_documento_caricato_da_operaio on public.hr_documenti;
create trigger trg_hr_documento_caricato_da_operaio after insert on public.hr_documenti
  for each row execute function public.hr_documento_caricato_da_operaio();
