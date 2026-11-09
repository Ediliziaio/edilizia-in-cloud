-- Rendiconto in appalto: una riga per PERSONA, non per rapportino.
--
-- La regola leggeva solo `ore_lavorate` dell'autore. Con la squadra e con i
-- rapportini scritti dall'ufficio quel campo resta 0 (le ore stanno in
-- `presenze`): la giornata non si rendicontava, oppure si fatturava una persona
-- sola. Il giornale invece contava tutti, e i due documenti non tornavano.
--
-- Da qui:
--   una riga per ogni persona presente, con la sua tariffa e il suo costo;
--   lo straordinario dell'autore in una riga sua, con la maggiorazione;
--   a giornata: fino a 4 ore mezza giornata, oltre una giornata;
--   a corpo: le ore non diventano righe, l'importo e' gia' concordato;
--   la riga nasce anche se chi approva non vede gli importi (prima il permesso
--   di chi cliccava decideva se la giornata veniva fatturata).
-- Ditte esterne e persone senza scheda non si valorizzano da sole: restano
-- nell'elenco «non rendicontate» col loro nome e il motivo.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Una riga per rapportino, persona e maggiorazione.
drop index if exists public.appalto_rendiconto_un_rapportino;
create unique index if not exists appalto_rendiconto_un_rapportino
  on public.appalto_rendiconto_righe (
    rapportino_id,
    (coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    maggiorazione_pct
  ) where rapportino_id is not null;

create or replace function public.appalto_righe_da_rapportino_calcola(p_rapportino_id uuid)
returns table(persona text, employee_id uuid, tariffa_id uuid, quantita numeric, maggiorazione_pct numeric, costo_interno numeric, motivo text)
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_r record;
  v_ord record;
  v_persone jsonb;
  v_p jsonb;
  v_emp record;
  v_t record;
  v_generiche integer;
  v_nome text;
  v_ore numeric;
  v_extra numeric;
  v_costo_ora numeric;
  v_magg numeric;
  v_motivo_persona text;
begin
  select cr.order_id, cr.company_id, cr.user_id, cr.data_lavoro, cr.ore_lavorate, cr.ore_straordinario, cr.presenze
    into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then return; end if;

  select o.order_type, o.appalto_contratto_id, o.valorizzazione, c.maggiorazione_straordinario_pct as magg
    into v_ord
    from public.orders o left join public.appalto_contratti c on c.id = o.appalto_contratto_id
   where o.id = v_r.order_id and o.deleted_at is null;
  if not found or v_ord.order_type is distinct from 'appaltatore_lavoro' then return; end if;
  -- A corpo l'importo e' concordato: le ore non si fatturano.
  if v_ord.valorizzazione = 'a_corpo' then return; end if;
  if v_ord.appalto_contratto_id is null then
    return query select null::text, null::uuid, null::uuid, null::numeric, 0::numeric, null::numeric,
      'La commessa non ha un contratto: senza listino non c''e'' prezzo'::text;
    return;
  end if;

  -- Chi ha lavorato: le presenze, sommate per persona; senza presenze l'autore.
  select coalesce(jsonb_agg(jsonb_build_object('emp', s.emp, 'sub', s.sub, 'nome', s.nome, 'ore', s.ore, 'extra', 0)), '[]'::jsonb)
    into v_persone
    from (
      select e.emp, e.sub, min(e.nome) as nome, sum(e.ore) as ore
        from (
          select case when p->>'employee_id' ~* '^[0-9a-f-]{36}$' then p->>'employee_id' end as emp,
                 case when p->>'subappaltatore_id' ~* '^[0-9a-f-]{36}$' then p->>'subappaltatore_id' end as sub,
                 coalesce(nullif(btrim(p->>'nome'), ''), 'Senza nome') as nome,
                 case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end as ore
            from jsonb_array_elements(case when jsonb_typeof(v_r.presenze) = 'array' then v_r.presenze else '[]'::jsonb end) p
        ) e
       group by e.emp, e.sub, case when e.emp is null and e.sub is null then e.nome end
    ) s;

  if jsonb_array_length(v_persone) = 0 then
    if coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0) <= 0 then
      return query select null::text, null::uuid, null::uuid, null::numeric, 0::numeric, null::numeric,
        'Il rapportino non porta ore'::text;
      return;
    end if;
    select e.id, btrim(concat_ws(' ', e.first_name, e.last_name)) as nome into v_emp
      from public.employees e
     where e.user_id = v_r.user_id and e.company_id = v_r.company_id
     order by coalesce(e.is_active, true) desc, e.created_at limit 1;
    v_persone := jsonb_build_array(jsonb_build_object(
      'emp', v_emp.id, 'sub', null, 'nome', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino'),
      'ore', coalesce(v_r.ore_lavorate, 0), 'extra', coalesce(v_r.ore_straordinario, 0), 'autore', true));
  end if;

  for v_p in select value from jsonb_array_elements(v_persone) loop
    v_nome := v_p->>'nome';
    v_ore := coalesce((v_p->>'ore')::numeric, 0);
    v_extra := coalesce((v_p->>'extra')::numeric, 0);
    if v_ore + v_extra <= 0 then continue; end if;

    if v_p->>'sub' is not null then
      return query select v_nome, null::uuid, null::uuid, null::numeric, 0::numeric, null::numeric,
        'Ditta esterna: non si valorizza da sola, scrivi la riga a mano'::text;
      continue;
    end if;
    if v_p->>'emp' is null and not coalesce((v_p->>'autore')::boolean, false) then
      return query select v_nome, null::uuid, null::uuid, null::numeric, 0::numeric, null::numeric,
        'Persona senza scheda dipendente: collegala o scrivi la riga a mano'::text;
      continue;
    end if;

    -- Sempre, anche senza id: cosi' v_emp ha i campi e valgono null.
    select e.id, e.qualifica, e.livello_inquadramento into v_emp
      from public.employees e
     where e.id = (v_p->>'emp')::uuid and e.company_id = v_r.company_id;

    select t.id, t.unita_misura, t.maggiorazione_straordinario_pct as magg into v_t
      from public.appalto_tariffe t
     where t.contratto_id = v_ord.appalto_contratto_id
       and t.tipo = 'manodopera' and t.attivo
       and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
       and (t.valido_al is null or v_r.data_lavoro <= t.valido_al)
       and t.qualifica is not null
       and v_emp.id is not null
       and (lower(btrim(t.qualifica)) = lower(btrim(coalesce(v_emp.qualifica, '')))
         or lower(btrim(t.qualifica)) = lower(btrim(coalesce(v_emp.livello_inquadramento, ''))))
     order by t.ordine limit 1;

    if v_t.id is null then
      select count(*) into v_generiche
        from public.appalto_tariffe t
       where t.contratto_id = v_ord.appalto_contratto_id
         and t.tipo = 'manodopera' and t.attivo and t.qualifica is null
         and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
         and (t.valido_al is null or v_r.data_lavoro <= t.valido_al);
      if v_generiche = 1 then
        select t.id, t.unita_misura, t.maggiorazione_straordinario_pct as magg into v_t
          from public.appalto_tariffe t
         where t.contratto_id = v_ord.appalto_contratto_id
           and t.tipo = 'manodopera' and t.attivo and t.qualifica is null
           and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
           and (t.valido_al is null or v_r.data_lavoro <= t.valido_al);
      elsif v_generiche > 1 then
        return query select v_nome, v_emp.id, null::uuid, null::numeric, 0::numeric, null::numeric,
          'Piu'' di una tariffa di manodopera senza qualifica: scegli tu quale'::text;
        continue;
      end if;
    end if;

    if v_t.id is null then
      v_motivo_persona := 'Nessuna tariffa di manodopera per questa qualifica in vigore il '
        || to_char(v_r.data_lavoro, 'DD/MM/YYYY');
      return query select v_nome, v_emp.id, null::uuid, null::numeric, 0::numeric, null::numeric, v_motivo_persona;
      continue;
    end if;

    v_costo_ora := case when v_emp.id is not null then nullif(public.costo_orario_dipendente(v_emp.id), 0) end;

    if v_t.unita_misura = 'ora' then
      if v_ore > 0 then
        return query select v_nome, v_emp.id, v_t.id, v_ore, 0::numeric, round(v_ore * v_costo_ora, 2), null::text;
      end if;
      if v_extra > 0 then
        v_magg := coalesce(v_t.magg, v_ord.magg, 0);
        return query select v_nome, v_emp.id, v_t.id, v_extra, v_magg, round(v_extra * v_costo_ora, 2), null::text;
      end if;
    elsif v_t.unita_misura in ('giornata', 'uomo_giorno') then
      return query select v_nome, v_emp.id, v_t.id,
        case when v_ore + v_extra <= 4 then 0.5 else 1 end::numeric,
        0::numeric, round((v_ore + v_extra) * v_costo_ora, 2), null::text;
    else
      return query select v_nome, v_emp.id, null::uuid, null::numeric, 0::numeric, null::numeric,
        ('La tariffa e'' a ' || v_t.unita_misura || ': le ore non si convertono da sole')::text;
    end if;
  end loop;
end;
$$;

revoke all on function public.appalto_righe_da_rapportino_calcola(uuid) from public, anon, authenticated;

create or replace function public.appalto_rendiconto_crea_righe(p_rapportino_id uuid)
returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  v_r record;
  v record;
  v_n integer := 0;
begin
  select cr.order_id, cr.data_lavoro into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then return 0; end if;

  for v in select * from public.appalto_righe_da_rapportino_calcola(p_rapportino_id) c
            where c.motivo is null and c.tariffa_id is not null loop
    if exists (
      select 1 from public.appalto_rendiconto_righe rr
       where (rr.rapportino_id = p_rapportino_id
              and rr.employee_id is not distinct from v.employee_id
              and rr.maggiorazione_pct = v.maggiorazione_pct)
          or (rr.rapportino_id is null and rr.order_id = v_r.order_id and rr.data = v_r.data_lavoro
              and v.employee_id is not null and rr.employee_id = v.employee_id)
    ) then
      continue;
    end if;
    insert into public.appalto_rendiconto_righe (
      order_id, data, tariffa_id, quantita, maggiorazione_pct, employee_id, fase_id,
      origine, rapportino_id, stato, descrizione, unita_misura, prezzo_unitario, costo_interno, note
    ) values (
      v_r.order_id, v_r.data_lavoro, v.tariffa_id, v.quantita, v.maggiorazione_pct, v.employee_id, null,
      'rapportino', p_rapportino_id, 'bozza', '—', 'cad', 0, v.costo_interno, v.persona
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.appalto_rendiconto_crea_righe(uuid) from public, anon, authenticated;

create or replace function public.appalto_rendiconto_da_rapportino()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  -- Solo al passaggio a «approvato»: un rapportino ritoccato non rigenera niente.
  if not (coalesce(new.approvato, false) and not coalesce(old.approvato, false)) then
    return new;
  end if;
  begin
    perform public.appalto_rendiconto_crea_righe(new.id);
  exception when others then
    -- L'approvazione non deve fallire per un problema di prezzi: la riga
    -- mancante si vede nell'elenco «da rendicontare», non sparisce in silenzio.
    null;
  end;
  return new;
end;
$$;

-- Per i rapportini gia' approvati, o dopo aver sistemato il listino.
create or replace function public.appalto_rendiconto_recupera(p_rapportino_id uuid)
returns integer
language plpgsql security definer set search_path to ''
as $$
declare v_r record;
begin
  select cr.order_id, cr.company_id, cr.approvato into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found or not coalesce(v_r.approvato, false) then
    raise exception 'Rapportino non approvato' using errcode = '23514';
  end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_r.order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_r.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_r.company_id) then
    raise exception 'Non hai il permesso di rendicontare questo rapportino' using errcode = '42501';
  end if;
  return public.appalto_rendiconto_crea_righe(p_rapportino_id);
end;
$$;

revoke all on function public.appalto_rendiconto_recupera(uuid) from public, anon;
grant execute on function public.appalto_rendiconto_recupera(uuid) to authenticated;

create or replace view public.v_appalto_rapportini_da_rendicontare as
 select cr.id as rapportino_id,
    cr.company_id,
    cr.order_id,
    cr.data_lavoro,
    cr.ore_lavorate,
    cr.user_id,
    cr.role_type,
    r.motivo,
    r.persona
   from public.campo_rapportini cr
     join public.orders o on o.id = cr.order_id and o.deleted_at is null and o.order_type = 'appaltatore_lavoro'::text
     cross join lateral public.appalto_righe_da_rapportino_calcola(cr.id) r
  where cr.approvato
    and not exists (
      select 1 from public.appalto_rendiconto_righe rr
       where (rr.rapportino_id = cr.id
              and rr.employee_id is not distinct from r.employee_id
              and rr.maggiorazione_pct = coalesce(r.maggiorazione_pct, 0))
          or (rr.rapportino_id is null and rr.order_id = cr.order_id and rr.data = cr.data_lavoro
              and r.employee_id is not null and rr.employee_id = r.employee_id))
    and public.puo_vedere_commessa(cr.order_id)
    and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts'::text, cr.company_id);

drop function if exists public.appalto_riga_da_rapportino(uuid);
