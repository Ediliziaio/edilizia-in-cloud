-- Un rendiconto per giorno, con le voci di TUTTI i rapportini di quel giorno
-- ──────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Il titolare, visto il primo giro: «se quel giorno ho già fatto dei rapportini per
-- quel cantiere, il rendiconto mi prende le voci dei rapportini». Prima ogni rapportino diventava
-- un rendiconto suo: due squadre lo stesso giorno = due fogli per il committente.
--
-- Ora: rendiconto_giornaliero_del_giorno(commessa, giorno) apre il rendiconto vivo di quel giorno
-- (o lo crea) e, se è in bozza, gli aggiunge le righe dei rapportini del giorno non ancora presi.
-- Quali rapportini sono già dentro lo dice rendiconto_giornaliero_rapportini: un rapportino sta
-- in un solo rendiconto, così un rapportino arrivato dopo si aggiunge senza raddoppiare gli altri.
-- Se il rendiconto è già confermato non si tocca: si dice quanti rapportini nuovi aspettano.
--
-- Idempotente. Scrive solo la tabella nuova (riporta i legami già esistenti).

-- 1. Quali rapportini sono in quale rendiconto ────────────────────────────────────────────────
create table if not exists public.rendiconto_giornaliero_rapportini (
  rapportino_id uuid primary key references public.campo_rapportini(id) on delete cascade,
  rendiconto_giornaliero_id uuid not null references public.rendiconti_giornalieri(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists rendiconto_giornaliero_rapportini_rg
  on public.rendiconto_giornaliero_rapportini (rendiconto_giornaliero_id);

alter table public.rendiconto_giornaliero_rapportini enable row level security;
drop policy if exists rgr_lettura on public.rendiconto_giornaliero_rapportini;
create policy rgr_lettura on public.rendiconto_giornaliero_rapportini for select to authenticated
  using (exists (select 1 from public.rendiconti_giornalieri g where g.id = rendiconto_giornaliero_id));
revoke all on public.rendiconto_giornaliero_rapportini from anon;
revoke insert, update, delete on public.rendiconto_giornaliero_rapportini from authenticated;
grant select on public.rendiconto_giornaliero_rapportini to authenticated;

insert into public.rendiconto_giornaliero_rapportini (rapportino_id, rendiconto_giornaliero_id)
select g.rapportino_id, g.id
  from public.rendiconti_giornalieri g
 where g.rapportino_id is not null and g.stato <> 'annullato'
on conflict (rapportino_id) do nothing;

-- 2. Rapportini di un giorno che non sono ancora in nessun rendiconto ─────────────────────────
-- Fuori: rifiutati, annullati, bozze dell'operaio, e quelli che il vecchio meccanismo aveva già
-- portato nel rendiconto (righe con rapportino_id), per non contarli due volte.
create or replace function private.rapportini_del_giorno_liberi(p_order uuid, p_data date)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cr.id
    from public.campo_rapportini cr
   where cr.order_id = p_order
     and cr.data_lavoro = p_data
     and cr.annullato_at is null
     and cr.stato in ('inviato', 'approvato')
     and not exists (select 1 from public.rendiconto_giornaliero_rapportini l where l.rapportino_id = cr.id)
     and not exists (select 1 from public.appalto_rendiconto_righe rr
                      where rr.rapportino_id = cr.id and rr.rendiconto_giornaliero_id is null)
   order by cr.created_at, cr.id;
$$;
revoke all on function private.rapportini_del_giorno_liberi(uuid, date) from public, anon, authenticated;

-- 3. Le righe attuali di un rendiconto, nel formato di rendiconto_giornaliero_salva ───────────
create or replace function private.rendiconto_giornaliero_righe_correnti(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'categoria', r.categoria,
           'descrizione', r.descrizione,
           'unita', r.unita_misura,
           'quantita', r.quantita,
           'prezzo_unitario', case when r.prezzo_a_mano or r.listino_voce_id is null then r.prezzo_unitario end,
           'prezzo_a_mano', r.prezzo_a_mano,
           'listino_voce_id', r.listino_voce_id,
           'employee_id', r.employee_id,
           'mezzo_id', r.mezzo_id,
           'fase_id', r.fase_id,
           'maggiorazione_pct', nullif(r.maggiorazione_pct, 0),
           'note', r.note)) order by r.ordine, r.created_at), '[]'::jsonb)
    from public.appalto_rendiconto_righe r
   where r.rendiconto_giornaliero_id = p_id;
$$;
revoke all on function private.rendiconto_giornaliero_righe_correnti(uuid) from public, anon, authenticated;

-- 4. Il rendiconto del giorno ──────────────────────────────────────────────────────────────────
create or replace function public.rendiconto_giornaliero_del_giorno(p_order_id uuid, p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rg record;
  v_nuovi uuid[];
  v_righe jsonb := '[]'::jsonb;
  v_descr text;
  v_id uuid;
  v_aggiunti integer := 0;
  v_tot integer;
  v_r uuid;
begin
  if p_order_id is null or p_data is null then
    raise exception 'Servono commessa e giorno' using errcode = '22023';
  end if;
  perform private.rendiconto_giornaliero_puo_scrivere(p_order_id);
  perform pg_advisory_xact_lock(hashtextextended('rendiconto_giornaliero:' || p_order_id::text, 0));

  select g.id, g.numero, g.stato, g.descrizione_lavori into v_rg
    from public.rendiconti_giornalieri g
   where g.order_id = p_order_id and g.data = p_data and g.stato <> 'annullato'
   order by (g.stato = 'bozza') desc, g.numero
   limit 1;

  select coalesce(array_agg(x), '{}') into v_nuovi from private.rapportini_del_giorno_liberi(p_order_id, p_data) x;

  -- Confermato: non si tocca. Si dice quanti rapportini aspettano.
  if v_rg.id is not null and v_rg.stato <> 'bozza' then
    select count(*) into v_tot from public.rendiconto_giornaliero_rapportini where rendiconto_giornaliero_id = v_rg.id;
    return jsonb_build_object('id', v_rg.id, 'numero', v_rg.numero, 'stato', v_rg.stato,
                              'aggiunti', 0, 'rapportini', v_tot, 'nuovi', coalesce(array_length(v_nuovi, 1), 0));
  end if;

  foreach v_r in array v_nuovi loop
    v_righe := v_righe || private.rendiconto_giornaliero_righe_da_rapportino(v_r);
  end loop;
  v_aggiunti := jsonb_array_length(v_righe);

  select string_agg(btrim(cr.descrizione_lavori), E'\n' order by cr.created_at) into v_descr
    from public.campo_rapportini cr
   where cr.id = any(v_nuovi) and coalesce(btrim(cr.descrizione_lavori), '') <> '';

  if v_rg.id is null then
    v_id := public.rendiconto_giornaliero_salva(jsonb_build_object(
      'order_id', p_order_id, 'data', p_data, 'descrizione_lavori', v_descr, 'righe', v_righe));
  else
    v_id := v_rg.id;
    if v_aggiunti > 0 or array_length(v_nuovi, 1) > 0 then
      perform public.rendiconto_giornaliero_salva(
        jsonb_build_object('id', v_id, 'data', p_data,
                           'righe', private.rendiconto_giornaliero_righe_correnti(v_id) || v_righe)
        || case when coalesce(btrim(v_rg.descrizione_lavori), '') = '' and v_descr is not null
                then jsonb_build_object('descrizione_lavori', v_descr)
                when v_descr is not null
                then jsonb_build_object('descrizione_lavori', v_rg.descrizione_lavori || E'\n' || v_descr)
                else '{}'::jsonb end);
    end if;
  end if;

  insert into public.rendiconto_giornaliero_rapportini (rapportino_id, rendiconto_giornaliero_id)
  select x, v_id from unnest(v_nuovi) x
  on conflict (rapportino_id) do nothing;

  select g.numero, g.stato into v_rg from public.rendiconti_giornalieri g where g.id = v_id;
  select count(*) into v_tot from public.rendiconto_giornaliero_rapportini where rendiconto_giornaliero_id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_rg.numero, 'stato', v_rg.stato,
                            'aggiunti', v_aggiunti, 'rapportini', v_tot, 'nuovi', 0);
end;
$function$;

-- 5. Dal singolo rapportino: è il rendiconto del suo giorno ─────────────────────────────────────
create or replace function public.rendiconto_giornaliero_da_rapportino(p_rapportino_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_r record; v_id uuid;
begin
  select cr.id, cr.order_id, cr.data_lavoro, cr.stato, cr.annullato_at
    into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then raise exception 'Rapportino inesistente' using errcode = '23514'; end if;
  perform private.rendiconto_giornaliero_puo_scrivere(v_r.order_id);
  if v_r.annullato_at is not null or v_r.stato = 'rifiutato' then
    raise exception 'Il rapportino è rifiutato o annullato: non entra nel rendiconto' using errcode = '23514';
  end if;
  -- Già dentro un rendiconto: quello.
  select l.rendiconto_giornaliero_id into v_id
    from public.rendiconto_giornaliero_rapportini l where l.rapportino_id = p_rapportino_id;
  if v_id is not null then return v_id; end if;
  return (public.rendiconto_giornaliero_del_giorno(v_r.order_id, v_r.data_lavoro)->>'id')::uuid;
end;
$function$;

-- 6. In blocco: un rendiconto per giorno ─────────────────────────────────────────────────────────
create or replace function public.rendiconti_giornalieri_da_rapportini(
  p_order_id uuid, p_dal date default null, p_al date default null, p_prova boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v record; v_giorni integer := 0; v_creare integer := 0; v_aggiornare integer := 0; v_fatti integer := 0;
  v_ids uuid[] := '{}'; v_errori jsonb := '[]'::jsonb; v_esito jsonb; v_stato text;
begin
  perform private.rendiconto_giornaliero_puo_scrivere(p_order_id);
  for v in
    select distinct cr.data_lavoro as giorno
      from public.campo_rapportini cr
     where cr.order_id = p_order_id
       and (p_dal is null or cr.data_lavoro >= p_dal)
       and (p_al is null or cr.data_lavoro <= p_al)
       and exists (select 1 from private.rapportini_del_giorno_liberi(p_order_id, cr.data_lavoro) x where x = cr.id)
     order by 1
  loop
    v_giorni := v_giorni + 1;
    select g.stato into v_stato from public.rendiconti_giornalieri g
     where g.order_id = p_order_id and g.data = v.giorno and g.stato <> 'annullato'
     order by (g.stato = 'bozza') desc, g.numero limit 1;
    if v_stato is null then v_creare := v_creare + 1;
    elsif v_stato = 'bozza' then v_aggiornare := v_aggiornare + 1;
    else v_fatti := v_fatti + 1; continue;
    end if;
    if not p_prova then
      begin
        v_esito := public.rendiconto_giornaliero_del_giorno(p_order_id, v.giorno);
        v_ids := v_ids || (v_esito->>'id')::uuid;
      exception when others then
        v_errori := v_errori || jsonb_build_array(jsonb_build_object('giorno', v.giorno, 'errore', sqlerrm));
      end;
    end if;
  end loop;
  return jsonb_build_object('prova', p_prova, 'giorni', v_giorni, 'da_creare', v_creare,
                            'da_aggiornare', v_aggiornare, 'gia_fatti', v_fatti,
                            'gia_nel_rendiconto', 0, 'creati', v_ids, 'errori', v_errori);
end;
$function$;

-- 7. Annullare libera i rapportini ─────────────────────────────────────────────────────────────
create or replace function public.rendiconto_giornaliero_annulla(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_rg record;
begin
  select * into v_rg from public.rendiconti_giornalieri where id = p_id for update;
  if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
  perform private.rendiconto_giornaliero_puo_scrivere(v_rg.order_id);
  if v_rg.stato = 'confermato' then
    raise exception 'Il rendiconto è confermato: riaprilo prima di annullarlo' using errcode = '23514';
  end if;
  perform set_config('eic.rendiconto_giornaliero', '1', true);
  delete from public.appalto_rendiconto_righe where rendiconto_giornaliero_id = p_id;
  delete from public.rendiconto_giornaliero_rapportini where rendiconto_giornaliero_id = p_id;
  update public.rendiconti_giornalieri
     set stato = 'annullato', annullato_da = auth.uid(), annullato_at = now(), updated_at = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'stato', 'annullato');
end;
$function$;

-- 8. Elenco: quanti rapportini dentro, quanti nuovi in attesa ─────────────────────────────────
create or replace view public.v_rendiconti_giornalieri
with (security_invoker = true) as
select g.id, g.company_id, g.order_id, g.data, g.numero, g.stato, g.descrizione_lavori, g.note,
       g.rapportino_id, g.created_at, g.updated_at, g.confermato_at, g.accettato_da_nome, g.accettato_il,
       coalesce(r.righe, 0) as righe,
       coalesce(r.totale, 0) as totale,
       coalesce(r.senza_prezzo, 0) as senza_prezzo,
       r.sal_id,
       (select count(*)::integer from public.rendiconto_giornaliero_rapportini l
         where l.rendiconto_giornaliero_id = g.id) as rapportini,
       case when g.stato = 'annullato' then 0
            else (select count(*)::integer from public.campo_rapportini cr
                   where cr.order_id = g.order_id and cr.data_lavoro = g.data
                     and cr.annullato_at is null and cr.stato in ('inviato', 'approvato')
                     and not exists (select 1 from public.rendiconto_giornaliero_rapportini l where l.rapportino_id = cr.id)
                     and not exists (select 1 from public.appalto_rendiconto_righe rr
                                      where rr.rapportino_id = cr.id and rr.rendiconto_giornaliero_id is null))
       end as rapportini_nuovi
  from public.rendiconti_giornalieri g
  left join lateral (
    select count(*)::integer as righe, sum(x.importo) as totale,
           (count(*) filter (where x.prezzo_unitario = 0 and not x.prezzo_a_mano))::integer as senza_prezzo,
           min(x.sal_id::text)::uuid as sal_id
      from public.appalto_rendiconto_righe x where x.rendiconto_giornaliero_id = g.id
  ) r on true;

revoke all on public.v_rendiconti_giornalieri from anon;
grant select on public.v_rendiconti_giornalieri to authenticated;

-- 9. Permessi ─────────────────────────────────────────────────────────────────────────────────
revoke all on function public.rendiconto_giornaliero_del_giorno(uuid, date) from public, anon;
grant execute on function public.rendiconto_giornaliero_del_giorno(uuid, date) to authenticated;
