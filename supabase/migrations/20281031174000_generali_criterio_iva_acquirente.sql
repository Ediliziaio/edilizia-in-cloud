-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali: criterio dei costi comuni, IVA delle unità, acquirente cliente
-- ════════════════════════════════════════════════════════════════════════════
--   1. commesse_generali.criterio_ripartizione: come si dividono i costi
--      registrati sulla generale (terreno, oneri, costi di cantiere) sulle
--      commesse dentro. «auto» = millesimi, poi m², poi importo, poi parti uguali.
--      Si sceglie da «Modifica» della generale (commessa_generale_criterio).
--   2. Le commesse delle unità nascono con IVA al 10% (vendita di abitazioni dal
--      costruttore), non al 22% di default.
--   3. Quando un'unità ha un acquirente, l'acquirente diventa il cliente della
--      sua commessa (prima restava «Cliente non disponibile»).
--   4. Dati: le commesse delle unità già create passano al 10% se erano al 22%,
--      e prendono come cliente l'acquirente se non ne avevano uno.
-- Le funzioni 2-3 sono quelle di 20281031120000 con le righe in più. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.commesse_generali
  add column if not exists criterio_ripartizione text not null default 'auto';
alter table public.commesse_generali drop constraint if exists commesse_generali_criterio;
alter table public.commesse_generali
  add constraint commesse_generali_criterio
  check (criterio_ripartizione in ('auto', 'millesimi', 'mq', 'importo', 'parti_uguali'));

comment on column public.commesse_generali.criterio_ripartizione is
  'Come si dividono i costi registrati sulla generale sulle commesse dentro: auto (millesimi, poi m², poi importo), millesimi, mq, importo, parti_uguali.';

create or replace function public.commessa_generale_criterio(p_generale_id uuid, p_criterio text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa commessa.' using errcode = '42501';
  end if;
  if p_criterio is null or p_criterio not in ('auto', 'millesimi', 'mq', 'importo', 'parti_uguali') then
    raise exception 'Criterio non valido.' using errcode = '22023';
  end if;
  update public.commesse_generali set criterio_ripartizione = p_criterio, updated_at = now()
   where order_id = p_generale_id;
  if not found then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.commessa_generale_criterio(uuid, text) from public, anon;
grant execute on function public.commessa_generale_criterio(uuid, text) to authenticated;

create or replace function public.generale_unita_nuova_commessa(p_azienda uuid, p_descrizione text, p_importo numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_stato uuid;
begin
  select s.id into v_stato
    from public.order_statuses s
   where s.company_id = p_azienda
   order by s.is_default desc, s.position, s.created_at
   limit 1;
  -- IVA al 10%: la vendita di abitazioni dal costruttore (la prima casa al 4% si cambia sulla commessa).
  insert into public.orders (id, company_id, created_by, description, workflow_kind, total_amount, order_code, current_status_id, vat_rate)
  values (v_id, p_azienda, auth.uid(), p_descrizione, 'commessa', coalesce(p_importo, 0),
          public.prossimo_numero_commessa(p_azienda), v_stato, 10);
  return v_id;
end;
$$;

create or replace function public.generale_unita_stato(p_order_id uuid, p_stato text, p_dati jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_importi boolean;
  v_u public.unita_immobiliari;
  d jsonb := coalesce(p_dati, '{}'::jsonb);
  v_acquirente uuid;
  v_data date;
  v_prezzo numeric;
  v_caparra numeric;
  v_saldo numeric;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa unità.' using errcode = '42501';
  end if;
  if p_stato is null or p_stato not in ('libera', 'prenotata', 'compromesso', 'rogitata') then
    raise exception 'Stato di vendita non valido.' using errcode = '22023';
  end if;
  v_u := public.generale_unita_assicura(p_order_id);
  if v_u.divisa_il is not null then
    raise exception 'Questa unità è stata divisa: si vendono le parti.' using errcode = '22023';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_caparra := public.generale_unita_numero(d, 'caparra', 'La caparra');
  v_saldo := public.generale_unita_numero(d, 'saldo', 'Il saldo');
  if (coalesce(v_caparra, 0) > 0 or coalesce(v_saldo, 0) > 0) and not v_importi then
    raise exception 'Non hai il permesso di registrare pagamenti.' using errcode = '42501';
  end if;

  v_acquirente := case when d ? 'acquirente_id' then nullif(d ->> 'acquirente_id', '')::uuid else v_u.acquirente_id end;
  if v_acquirente is not null and v_acquirente is distinct from v_u.acquirente_id and not exists (
    select 1 from public.profiles p where p.id = v_acquirente and p.company_id = v_azienda and p.deleted_at is null
  ) then
    raise exception 'Acquirente non trovato tra i clienti.' using errcode = 'P0002';
  end if;

  if p_stato = 'libera' then
    if exists (select 1 from public.unita_movimenti m where m.unita_id = v_u.id) then
      raise exception 'Su % ci sono pagamenti registrati: toglili prima di rimetterla in vendita.', v_u.sigla using errcode = '22023';
    end if;
    update public.unita_immobiliari
       set stato_vendita = 'libera', acquirente_id = null,
           data_prenotazione = null, data_compromesso = null, rogito_previsto = null, data_rogito = null,
           prezzo_trattato = null, prezzo_rogito = null, updated_at = now()
     where id = v_u.id;
  else
    if v_acquirente is null then
      raise exception 'Scegli l''acquirente.' using errcode = '22023';
    end if;
    if p_stato <> 'rogitata' and exists (
      select 1 from public.unita_movimenti m where m.unita_id = v_u.id and m.tipo = 'saldo'
    ) then
      raise exception 'Su % è registrato il saldo del rogito: toglilo prima di tornare indietro.', v_u.sigla using errcode = '22023';
    end if;
    v_data := nullif(d ->> 'data', '')::date;

    if p_stato = 'prenotata' then
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo') else v_u.prezzo_trattato end;
      update public.unita_immobiliari
         set stato_vendita = 'prenotata', acquirente_id = v_acquirente,
             data_prenotazione = coalesce(v_data, data_prenotazione, current_date),
             prezzo_trattato = v_prezzo,
             data_compromesso = null, rogito_previsto = null, data_rogito = null, prezzo_rogito = null,
             updated_at = now()
       where id = v_u.id
       returning data_prenotazione into v_data;
    elsif p_stato = 'compromesso' then
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo')
                       else coalesce(v_u.prezzo_trattato, v_u.prezzo_listino) end;
      if v_prezzo is null then
        raise exception 'Scrivi il prezzo pattuito nel compromesso.' using errcode = '22023';
      end if;
      update public.unita_immobiliari
         set stato_vendita = 'compromesso', acquirente_id = v_acquirente,
             data_compromesso = coalesce(v_data, data_compromesso, current_date),
             rogito_previsto = case when d ? 'rogito_previsto' then nullif(d ->> 'rogito_previsto', '')::date else rogito_previsto end,
             prezzo_trattato = v_prezzo,
             data_rogito = null, prezzo_rogito = null,
             updated_at = now()
       where id = v_u.id
       returning data_compromesso into v_data;
    else
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo')
                       else coalesce(v_u.prezzo_rogito, v_u.prezzo_trattato, v_u.prezzo_listino) end;
      if v_prezzo is null then
        raise exception 'Scrivi il prezzo dell''atto.' using errcode = '22023';
      end if;
      update public.unita_immobiliari
         set stato_vendita = 'rogitata', acquirente_id = v_acquirente,
             data_rogito = coalesce(v_data, data_rogito, current_date),
             prezzo_rogito = v_prezzo,
             prezzo_trattato = coalesce(prezzo_trattato, v_prezzo),
             updated_at = now()
       where id = v_u.id
       returning data_rogito into v_data;
    end if;

    -- L'acquirente è il cliente della commessa dell'unità: nome, rubrica e fatture lo trovano lì.
    if v_acquirente is not null then
      update public.orders o
         set customer_id = v_acquirente,
             client_name = coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), o.client_name),
             updated_at = now()
        from public.profiles p
       where o.id = v_u.order_id and p.id = v_acquirente and o.customer_id is distinct from v_acquirente;
    end if;

    if coalesce(v_caparra, 0) > 0 then
      if p_stato = 'rogitata' then
        raise exception 'Al rogito si registra il saldo, non la caparra.' using errcode = '22023';
      end if;
      insert into public.unita_movimenti (unita_id, company_id, tipo, importo, data, created_by)
      values (v_u.id, v_u.company_id, 'caparra', v_caparra, v_data, auth.uid());
    end if;
    if coalesce(v_saldo, 0) > 0 then
      if p_stato <> 'rogitata' then
        raise exception 'Il saldo si registra al rogito.' using errcode = '22023';
      end if;
      insert into public.unita_movimenti (unita_id, company_id, tipo, importo, data, created_by)
      values (v_u.id, v_u.company_id, 'saldo', v_saldo, v_data, auth.uid());
    end if;
  end if;

  perform public.generale_unita_allinea(v_u.id, null);
end;
$$;

-- Dati: le unità già create (poche: il modulo è del 31/10).
update public.orders o set vat_rate = 10, updated_at = now()
 where o.vat_rate = 22
   and o.id in (select u.order_id from public.unita_immobiliari u);

update public.orders o
   set customer_id = u.acquirente_id,
       client_name = coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), o.client_name),
       updated_at = now()
  from public.unita_immobiliari u
  join public.profiles p on p.id = u.acquirente_id
 where o.id = u.order_id and u.acquirente_id is not null and o.customer_id is null;
