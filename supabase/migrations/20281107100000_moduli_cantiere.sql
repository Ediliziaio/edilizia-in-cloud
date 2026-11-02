-- Il modulo di cantiere dell'azienda: parti del rapportino accese o spente, campi propri, modelli di verbale.
-- Senza una riga qui tutto resta com'è: l'app usa SCHEMA_COME_OGGI (supabase/functions/_shared/moduliCantiere.ts).
-- I valori stanno nel documento (campo_rapportini.campi_extra), con etichetta e tipo: un modello cambiato non
-- altera quello che è già stato scritto, e un operaio salva tutto in una sola scrittura sul suo rapportino.

create table if not exists public.moduli_cantiere (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('rapportino', 'verbale')),
  nome text not null check (btrim(nome) <> '' and length(nome) <= 80),
  schema jsonb not null check (jsonb_typeof(schema) = 'object' and pg_column_size(schema) <= 65536),
  attivo boolean not null default true,
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
-- Un solo modello di rapportino per azienda; i modelli di verbale possono essere più d'uno.
create unique index if not exists moduli_cantiere_un_rapportino on public.moduli_cantiere (company_id) where tipo = 'rapportino' and deleted_at is null;
create index if not exists moduli_cantiere_azienda on public.moduli_cantiere (company_id, tipo) where deleted_at is null;

alter table public.moduli_cantiere enable row level security;
-- Si legge da chi configura e da chi crea i verbali; si scrive solo con moduli_cantiere_salva.
drop policy if exists moduli_cantiere_lettura on public.moduli_cantiere;
create policy moduli_cantiere_lettura on public.moduli_cantiere for select to authenticated
  using (not (select public.utente_bloccato())
         and (public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id)
              or public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)));
revoke insert, update, delete on public.moduli_cantiere from authenticated, anon;

alter table public.campo_rapportini add column if not exists campi_extra jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.campo_rapportini add constraint campo_rapportini_campi_extra_validi
    check (jsonb_typeof(campi_extra) = 'array' and pg_column_size(campi_extra) <= 32768);
exception when duplicate_object then null; end $$;

-- Lo schema che vale su una commessa, per chi ci lavora: è sempre quello dell'azienda della commessa, anche per un
-- subappaltatore. null = nessun modello, si lavora come oggi.
create or replace function public.modulo_rapportino_per_ordine(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if auth.uid() is null or v_company is null or not (
    coalesce(public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', v_company), false)
    or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', v_company), false)
    or coalesce(public.campo_lavoro_su_commessa(p_order_id), false))
  then raise exception 'Non puoi leggere il modulo di questa commessa' using errcode = '42501'; end if;
  return (select m.schema from public.moduli_cantiere m
           where m.company_id = v_company and m.tipo = 'rapportino' and m.attivo and m.deleted_at is null);
end $$;
revoke all on function public.modulo_rapportino_per_ordine(uuid) from public, anon;
grant execute on function public.modulo_rapportino_per_ordine(uuid) to authenticated;

-- Quanti documenti contengono ogni campo. Serve a non rovinare i dati cambiando un modello già usato.
create or replace function public.moduli_cantiere_conta_uso(p_company_id uuid, p_tipo text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(chiave, n), '{}'::jsonb) from (
    select v->>'chiave' as chiave, count(distinct d.id) as n
      from (
        select r.id, r.campi_extra as valori from public.campo_rapportini r
         where p_tipo = 'rapportino' and r.company_id = p_company_id and r.campi_extra <> '[]'::jsonb
        union all
        select a.id, a.content->'valori' from public.order_acceptance_reports a
         where p_tipo = 'verbale' and a.company_id = p_company_id and jsonb_typeof(a.content->'valori') = 'array'
      ) d, jsonb_array_elements(d.valori) v
     where v->>'chiave' is not null
     group by 1
  ) x
$$;
revoke all on function public.moduli_cantiere_conta_uso(uuid, text) from public, anon, authenticated;

create or replace function public.moduli_cantiere_uso(p_company_id uuid, p_tipo text)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', p_company_id), false) then
    raise exception using errcode = '42501', message = 'Non puoi vedere queste impostazioni.';
  end if;
  return public.moduli_cantiere_conta_uso(p_company_id, p_tipo);
end $$;
revoke all on function public.moduli_cantiere_uso(uuid, text) from public, anon;
grant execute on function public.moduli_cantiere_uso(uuid, text) to authenticated;

create or replace function public.moduli_cantiere_salva(p_company_id uuid, p_id uuid, p_tipo text, p_nome text, p_schema jsonb, p_attivo boolean default true)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_prima jsonb;
  v_uso jsonb;
  c jsonb;
  v_nuovo jsonb;
begin
  if auth.uid() is null or public.utente_bloccato() then
    raise exception using errcode = '42501', message = 'Sessione non autorizzata.';
  end if;
  perform public.assert_company_access(p_company_id);
  if public.utente_sola_lettura(p_company_id)
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id), false) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  if p_tipo not in ('rapportino', 'verbale') then
    raise exception using errcode = '22023', message = 'Tipo di modulo non valido.';
  end if;
  if btrim(coalesce(p_nome, '')) = '' or length(p_nome) > 80 then
    raise exception using errcode = '22023', message = 'Dai un nome al modello (al massimo 80 caratteri).';
  end if;
  if jsonb_typeof(p_schema) is distinct from 'object' or jsonb_typeof(p_schema->'campi') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Modello non valido.';
  end if;

  if v_id is null and p_tipo = 'rapportino' then
    select id into v_id from public.moduli_cantiere where company_id = p_company_id and tipo = 'rapportino' and deleted_at is null;
  end if;
  if v_id is not null then
    select schema into v_prima from public.moduli_cantiere
     where id = v_id and company_id = p_company_id and tipo = p_tipo and deleted_at is null for update;
    if not found then
      raise exception using errcode = '42501', message = 'Modello non trovato in questa azienda.';
    end if;
    -- Un campo con dati non cambia tipo e non sparisce: si archivia.
    v_uso := public.moduli_cantiere_conta_uso(p_company_id, p_tipo);
    for c in select value from jsonb_array_elements(coalesce(v_prima->'campi', '[]'::jsonb)) loop
      if coalesce((v_uso->>(c->>'chiave'))::int, 0) > 0 then
        select value into v_nuovo from jsonb_array_elements(p_schema->'campi') where value->>'chiave' = c->>'chiave' limit 1;
        if not found then
          raise exception using errcode = '22023', message = format('«%s» è già in %s documenti: si può solo archiviare.', c->>'etichetta', v_uso->>(c->>'chiave'));
        elsif v_nuovo->>'tipo' is distinct from c->>'tipo' then
          raise exception using errcode = '22023', message = format('«%s»: il tipo non si cambia, %s documenti contengono già questo campo.', c->>'etichetta', v_uso->>(c->>'chiave'));
        end if;
      end if;
    end loop;
    update public.moduli_cantiere
       set nome = btrim(p_nome), schema = p_schema, attivo = coalesce(p_attivo, true), aggiornato_il = now(), aggiornato_da = auth.uid()
     where id = v_id;
  else
    insert into public.moduli_cantiere (company_id, tipo, nome, schema, attivo, aggiornato_da)
    values (p_company_id, p_tipo, btrim(p_nome), p_schema, coalesce(p_attivo, true), auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.moduli_cantiere_salva(uuid, uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.moduli_cantiere_salva(uuid, uuid, text, text, jsonb, boolean) to authenticated;

-- L'inserimento a mano dall'ufficio salva anche i campi propri. Il resto è com'era in 20281031235000.
create or replace function public.ufficio_crea_rapportini(p_order_id uuid, p_rapportini jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c uuid;
  assegnata uuid;
  r jsonb;
  x jsonb;
  v_autore uuid;
  v_giorno date;
  v_fasi jsonb;
  v_presenze jsonb;
  v_foto jsonb;
  v_materiali jsonb;
  v_mezzi jsonb;
  v_campi jsonb;
  v_ore numeric;
  v_prefisso text;
  n integer := 0;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select company_id, assigned_to into c, assegnata from public.orders where id = p_order_id and deleted_at is null;
  if c is null then
    raise exception 'Commessa non trovata.' using errcode = 'P0002';
  end if;
  perform public.assert_company_access(c);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', c) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_orders', c) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_giornale_lavori', c) is not true
     or public.check_staff_visibility(auth.uid(), assegnata) is not true then
    raise exception 'Non hai il permesso di scrivere rapportini su questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rapportini) is distinct from 'array' or jsonb_array_length(p_rapportini) = 0 or jsonb_array_length(p_rapportini) > 31 then
    raise exception 'Da 1 a 31 rapportini alla volta.' using errcode = '22023';
  end if;
  v_prefisso := '/campo-rapportini/' || c::text || '/' || p_order_id::text || '/';

  for r in select value from jsonb_array_elements(p_rapportini) loop
    v_giorno := nullif(r->>'data_lavoro', '')::date;
    if v_giorno is null or v_giorno > (now() at time zone 'Europe/Rome')::date then
      raise exception 'Ogni rapportino ha una data, non nel futuro.' using errcode = '22023';
    end if;
    if btrim(coalesce(r->>'descrizione', '')) = '' then
      raise exception 'Scrivi cosa si è fatto il %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    v_autore := coalesce(nullif(r->>'autore', '')::uuid, auth.uid());
    if v_autore <> auth.uid() and not exists (
      select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_autore
    ) then
      raise exception 'La persona scelta non lavora su questa commessa con l''app.' using errcode = '42501';
    end if;

    v_fasi := coalesce(r->'fasi_lavorate', '[]'::jsonb);
    if jsonb_typeof(v_fasi) <> 'array' or exists (
      select 1 from jsonb_array_elements(v_fasi) e
       where not exists (select 1 from public.order_work_phases f where f.id::text = e->>'phase_id' and f.order_id = p_order_id)
    ) then
      raise exception 'Una fase del rapportino del % non è di questa commessa.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    -- Chi ha lavorato e quante ore: dipendenti e ditte dell'azienda, ore da 0 a 24.
    v_presenze := coalesce(r->'presenze', '[]'::jsonb);
    if jsonb_typeof(v_presenze) <> 'array' or jsonb_array_length(v_presenze) > 60 then
      raise exception 'Presenze non valide il %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    for x in select value from jsonb_array_elements(v_presenze) loop
      begin
        v_ore := (x->>'ore')::numeric;
      exception when others then
        v_ore := null;
      end;
      if v_ore is null or v_ore < 0 or v_ore > 24 then
        raise exception 'Le ore di % il % vanno da 0 a 24.', coalesce(x->>'nome', 'una persona'), to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
      end if;
      if nullif(x->>'employee_id', '') is not null then
        if not exists (select 1 from public.employees e where e.id::text = x->>'employee_id' and e.company_id = c) then
          raise exception 'Una persona del % non è della tua azienda.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '42501';
        end if;
      elsif nullif(x->>'subappaltatore_id', '') is not null then
        if not exists (select 1 from public.subappaltatori s where s.id::text = x->>'subappaltatore_id' and s.company_id = c) then
          raise exception 'Una ditta del % non è della tua azienda.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '42501';
        end if;
      else
        raise exception 'Ogni presenza è una persona o una ditta.' using errcode = '22023';
      end if;
    end loop;
    if (select count(*) from jsonb_array_elements(v_presenze) e where e->>'employee_id' is not null)
       <> (select count(distinct e->>'employee_id') from jsonb_array_elements(v_presenze) e where e->>'employee_id' is not null) then
      raise exception 'Una persona è due volte nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    -- Foto: solo quelle caricate nella cartella di questa commessa.
    v_foto := coalesce(r->'foto_urls', '[]'::jsonb);
    if jsonb_typeof(v_foto) <> 'array' or jsonb_array_length(v_foto) > 30 or exists (
      select 1 from jsonb_array_elements_text(v_foto) u where position(v_prefisso in u) = 0
    ) then
      raise exception 'Foto non valide nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    v_materiali := coalesce(r->'materiali_usati', '[]'::jsonb);
    if jsonb_typeof(v_materiali) <> 'array' or jsonb_array_length(v_materiali) > 100 or exists (
      select 1 from jsonb_array_elements(v_materiali) m
       where btrim(coalesce(m->>'nome', '')) = ''
          or (m->>'quantita') !~ '^[0-9]+(\.[0-9]+)?$' or (m->>'quantita')::numeric <= 0
          or (nullif(m->>'order_item_id', '') is not null
              and not exists (select 1 from public.order_items i where i.id::text = m->>'order_item_id' and i.order_id = p_order_id))
    ) then
      raise exception 'Materiali non validi nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    v_mezzi := coalesce(r->'mezzi_usati', '[]'::jsonb);
    if jsonb_typeof(v_mezzi) <> 'array' or jsonb_array_length(v_mezzi) > 50 or exists (
      select 1 from jsonb_array_elements(v_mezzi) m
       where not exists (select 1 from public.mezzi z where z.id::text = m->>'mezzo_id' and z.company_id = c and z.deleted_at is null)
          or (nullif(m->>'ore', '') is not null and ((m->>'ore') !~ '^[0-9]+(\.[0-9]+)?$' or (m->>'ore')::numeric > 24))
    ) then
      raise exception 'Mezzi non validi nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    v_campi := coalesce(r->'campi_extra', '[]'::jsonb);
    if jsonb_typeof(v_campi) <> 'array' or pg_column_size(v_campi) > 32768 then
      raise exception 'Campi non validi nel rapportino del %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    begin
      insert into public.campo_rapportini (company_id, order_id, user_id, role_type, data_lavoro, descrizione_lavori,
                                           ore_lavorate, fasi_lavorate, note, stato, ufficio_created_by,
                                           presenze, foto_urls, materiali_usati, mezzi_usati, meteo, campi_extra)
      values (c, p_order_id, v_autore, 'employee', v_giorno, left(btrim(r->>'descrizione'), 4000),
              0, v_fasi, nullif(left(btrim(coalesce(r->>'note', '')), 4000), ''), 'inviato', auth.uid(),
              case when jsonb_array_length(v_presenze) > 0 then v_presenze else null end,
              array(select jsonb_array_elements_text(v_foto)),
              case when jsonb_array_length(v_materiali) > 0 then v_materiali else null end,
              v_mezzi,
              -- Gli stessi cinque valori del cantiere (campo_rapportini_meteo_check); altro = non detto.
              case when r->>'meteo' in ('soleggiato', 'nuvoloso', 'pioggia', 'neve', 'vento') then r->>'meteo' end,
              v_campi);
    exception when unique_violation then
      raise exception 'Il % c''è già un rapportino di questa persona: correggi quello invece di crearne un altro.', to_char(v_giorno, 'DD/MM/YYYY')
        using errcode = '23505';
    end;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.ufficio_crea_rapportini(uuid, jsonb) from public, anon;
grant execute on function public.ufficio_crea_rapportini(uuid, jsonb) to authenticated;
