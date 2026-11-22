set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- L’accesso alla scheda tecnica non crea un’assegnazione operativa o un capocantiere.
create table private.campo_accessi_tecnici (
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (order_id, user_id)
);
alter table private.campo_accessi_tecnici enable row level security;
revoke all on private.campo_accessi_tecnici from public, anon, authenticated;
create index campo_accessi_tecnici_utente on private.campo_accessi_tecnici(user_id, order_id);

create function private.campo_tecnico_interno(p_azienda uuid, p_persona uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    left join public.multi_company_access a on a.user_id = p.id and a.company_id = p_azienda
      and a.status = 'active' and (a.expires_at is null or a.expires_at > now())
    where p.id = p_persona and not coalesce(p.is_blocked, false)
      and coalesce(
        a.access_role in ('employee', 'company_staff', 'company_admin'),
        p.company_id = p_azienda
          and (public.has_role(p.id, 'employee') or public.has_role(p.id, 'company_staff') or public.has_role(p.id, 'company_admin'))
          and not public.has_role(p.id, 'subcontractor')
      )
  );
$$;

create function private.campo_scheda_visibile(p_azienda uuid, p_ordine uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and p_azienda = public.get_effective_company_id()
    and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
    and exists (
      select 1 from public.orders o
      where o.id = p_ordine and o.company_id = p_azienda and o.deleted_at is null
        and private.campo_tecnico_interno(o.company_id, auth.uid())
        and (
          exists (
            select 1 from public.order_campo_assignments a
            where a.order_id = o.id and a.company_id = o.company_id and a.user_id = auth.uid()
              and a.role_type = 'employee' and a.is_capocantiere
          )
          or exists (
            select 1 from private.campo_accessi_tecnici a where a.order_id = o.id and a.user_id = auth.uid()
          )
        )
    );
$$;

create function private.campo_accessi_tecnici_gestibili(p_ordine uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
    and not public.e_solo_campo() and exists (
      select 1 from public.orders o where o.id = p_ordine and o.deleted_at is null
        and o.company_id = public.get_effective_company_id() and private.office_visible_order(o.id)
        and not public.utente_sola_lettura(o.company_id) and public.can_access_company_people(o.company_id)
        and public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id)
    );
$$;

create function private.campo_documento_leggibile(p_percorso text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.order_attachments a where a.file_url = p_percorso
      and private.documento_cantiere_qr_valido(a)
      and private.campo_scheda_visibile(public.get_effective_company_id(), a.order_id)
  ) and not exists (
    select 1 from public.order_attachments a where a.file_url = p_percorso
      and (not private.documento_cantiere_qr_valido(a)
        or not coalesce(private.campo_scheda_visibile(public.get_effective_company_id(), a.order_id), false))
  );
$$;

-- Il download e la creazione del link firmato applicano le stesse regole.
drop policy if exists office_attachment_file_read on storage.objects;
create policy office_attachment_file_read on storage.objects as restrictive for select to authenticated
  using (
    bucket_id not in ('order-attachments', 'order-variation-documents')
    or private.office_attachment_file_allowed(bucket_id, name)
    or (bucket_id = 'order-attachments' and private.campo_documento_leggibile(name))
  );
create policy campo_documenti_operativi_assegnati on storage.objects for select to authenticated
  using (bucket_id = 'order-attachments' and private.campo_documento_leggibile(name));

create function private.campo_cantieri_tecnici(p_azienda uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'codice', o.order_code, 'titolo', o.description, 'indirizzo', o.indirizzo_lavori
  ) order by o.order_code, o.id), '[]'::jsonb)
  from (
    select a.order_id from private.campo_accessi_tecnici a where a.user_id = auth.uid()
    union
    select a.order_id from public.order_campo_assignments a
      where a.user_id = auth.uid() and a.company_id = p_azienda and a.is_capocantiere
  ) accessi join public.orders o on o.id = accessi.order_id
  where private.campo_scheda_visibile(p_azienda, o.id);
$$;

create function private.campo_scheda_cantiere(p_azienda uuid, p_ordine uuid, p_sezione text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  scheda jsonb;
  contenuto jsonb;
begin
  if not coalesce(private.campo_scheda_visibile(p_azienda, p_ordine), false) then
    raise exception using errcode = '42501', message = 'Scheda cantiere non autorizzata.';
  end if;

  select jsonb_build_object(
    'id', o.id, 'codice', o.order_code, 'titolo', o.description, 'indirizzo', o.indirizzo_lavori,
    'inizio', o.work_start_date, 'fine', o.work_end_date, 'progresso', o.percentuale_avanzamento
  ) into scheda from public.orders o where o.id = p_ordine and o.company_id = p_azienda;

  if p_sezione = 'documenti' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.file_name, 'mime', a.file_type, 'percorso', a.file_url,
      'categoria', a.cantiere_tipo, 'revisione', a.revisione
    ) order by a.cantiere_tipo nulls last, lower(a.file_name), a.id), '[]'::jsonb)
    into contenuto
    from public.order_attachments a where a.order_id = p_ordine and private.documento_cantiere_qr_valido(a);

    return jsonb_build_object('cantiere', scheda, 'documenti', contenuto);
  end if;

  if p_sezione is distinct from 'piano' then
    raise exception using errcode = '22023', message = 'Sezione del cantiere non disponibile.';
  end if;

  -- Come nel cronoprogramma dell’ufficio, l’inizio reale viene dai rapportini.
  with giorni as (
    select voce ->> 'phase_id' as fase_id, min(r.data_lavoro) as primo, max(r.data_lavoro) as ultimo
    from public.campo_rapportini r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.fasi_lavorate) = 'array' then r.fasi_lavorate else '[]'::jsonb end
    ) voce
    where r.order_id = p_ordine and r.company_id = p_azienda and r.annullato_at is null
      and r.stato in ('inviato', 'approvato') and voce ->> 'phase_id' is not null
    group by voce ->> 'phase_id'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'name', f.name, 'status', f.status, 'percentuale', f.percentuale, 'note', f.notes,
    'start_date', f.start_date, 'end_date', f.end_date, 'completata_il', f.completata_il,
    'primo', g.primo, 'ultimo', g.ultimo, 'sottofasi', coalesce(s.elementi, '[]'::jsonb)
  ) order by f.position, f.id), '[]'::jsonb) into contenuto
  from public.order_work_phases f left join giorni g on g.fase_id = f.id::text
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'phase_id', s.phase_id, 'position', s.position, 'name', s.name, 'peso', s.peso,
      'fatta', s.fatta, 'fatta_il', s.fatta_il, 'percentuale', s.percentuale, 'data_inizio', s.data_inizio,
      'data_fine', s.data_fine, 'giorni', s.giorni, 'in_parallelo', s.in_parallelo, 'risorse', s.risorse,
      'iniziata_il', s.iniziata_il, 'giorni_lavorati', s.giorni_lavorati
    ) order by s.position, s.id) as elementi
    from public.order_work_subphases s where s.phase_id = f.id
  ) s on true
  where f.order_id = p_ordine and f.company_id = p_azienda;

  return jsonb_build_object('cantiere', scheda, 'fasi', contenuto);
end;
$$;

create function private.commessa_accessi_tecnici(p_ordine uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  azienda uuid := public.get_effective_company_id();
  persone jsonb;
begin
  if not coalesce(private.campo_accessi_tecnici_gestibili(p_ordine), false) then
    raise exception using errcode = '42501', message = 'Gestione accessi non autorizzata.';
  end if;
  with utenti as (
    select id from public.profiles where company_id = azienda
    union
    select user_id from public.multi_company_access where company_id = azienda
      and status = 'active' and (expires_at is null or expires_at > now())
    union
    select user_id from private.campo_accessi_tecnici where order_id = p_ordine
  ), accessi as materialized (
    select p.id, coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Utente interno') as nome,
      a.user_id is not null as abilitato, private.campo_tecnico_interno(azienda, p.id) as ammissibile
    from utenti u join public.profiles p on p.id = u.id
    left join private.campo_accessi_tecnici a on a.order_id = p_ordine and a.user_id = p.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'abilitato', a.abilitato, 'ammissibile', a.ammissibile)
    order by lower(a.nome), a.id), '[]'::jsonb) into persone
  from accessi a where a.abilitato or a.ammissibile;
  return persone;
end;
$$;

create function private.commessa_accesso_tecnico(p_ordine uuid, p_persona uuid, p_consentito boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(private.campo_accessi_tecnici_gestibili(p_ordine), false) then
    raise exception using errcode = '42501', message = 'Gestione accessi non autorizzata.';
  end if;

  if p_persona is null or p_consentito is null then
    raise exception using errcode = '22023', message = 'Scegli una persona e il tipo di accesso.';
  end if;
  if p_consentito then
    if not private.campo_tecnico_interno(public.get_effective_company_id(), p_persona) then
      raise exception using errcode = '22023', message = 'Scegli un utente interno attivo di questa azienda.';
    end if;
    insert into private.campo_accessi_tecnici (order_id, user_id) values (p_ordine, p_persona)
    on conflict (order_id, user_id) do nothing;
  else
    delete from private.campo_accessi_tecnici where order_id = p_ordine and user_id = p_persona;
  end if;
end;
$$;

create function public.campo_cantieri_tecnici(p_azienda uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.campo_cantieri_tecnici(p_azienda); $$;

create function public.campo_scheda_cantiere(p_azienda uuid, p_ordine uuid, p_sezione text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.campo_scheda_cantiere(p_azienda, p_ordine, p_sezione); $$;

create function public.commessa_accessi_tecnici(p_ordine uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.commessa_accessi_tecnici(p_ordine); $$;

create function public.commessa_accesso_tecnico(p_ordine uuid, p_persona uuid, p_consentito boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.commessa_accesso_tecnico(p_ordine, p_persona, p_consentito); $$;

revoke all on function private.campo_tecnico_interno(uuid, uuid), private.campo_scheda_visibile(uuid, uuid),
  private.campo_accessi_tecnici_gestibili(uuid)
  from public, anon, authenticated;
revoke all on function private.campo_documento_leggibile(text),
  private.campo_cantieri_tecnici(uuid), private.campo_scheda_cantiere(uuid, uuid, text),
  private.commessa_accessi_tecnici(uuid), private.commessa_accesso_tecnico(uuid, uuid, boolean),
  public.campo_cantieri_tecnici(uuid), public.campo_scheda_cantiere(uuid, uuid, text),
  public.commessa_accessi_tecnici(uuid), public.commessa_accesso_tecnico(uuid, uuid, boolean)
  from public, anon;
grant execute on function private.campo_documento_leggibile(text),
  private.campo_cantieri_tecnici(uuid), private.campo_scheda_cantiere(uuid, uuid, text),
  private.commessa_accessi_tecnici(uuid), private.commessa_accesso_tecnico(uuid, uuid, boolean),
  public.campo_cantieri_tecnici(uuid), public.campo_scheda_cantiere(uuid, uuid, text),
  public.commessa_accessi_tecnici(uuid), public.commessa_accesso_tecnico(uuid, uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';
