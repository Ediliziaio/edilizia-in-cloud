-- «Crea riga» per le voci e per i mezzi, non solo per la manodopera
-- ────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Completa il Lotto 0 e fa il Lotto 6 di
-- docs/piano-rendiconto-da-rapportini-verifica.md
--
-- Provata la vista nuova sui dati di un’impresa in appalto: da 1 riga elencata a 26,
-- e il camion da 9 ore del 23/11 compare. Ma quattordici voci dicevano «Voce
-- con un prezzo ma senza riga: riapprova il rapportino» — e riapprovare un
-- rapportino non è una cosa che l'ufficio possa fare: sono voci scritte su
-- rapportini approvati PRIMA della 20290624100000, quando la vendita veniva
-- buttata. Un motivo che chiede un gesto impossibile è peggio di nessun
-- motivo.
--
-- Quindi: la manodopera aveva già `appalto_rendiconto_recupera` («Crea riga»).
-- Qui nascono le due sorelle che mancavano, e la voce con un prezzo torna ad
-- avere `motivo = null`, che a schermo vuol dire «si può creare».

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Un mezzo, una riga per rapportino
-- ───────────────────────────────────────────────────────────────────────────

create unique index if not exists appalto_rendiconto_un_mezzo
  on public.appalto_rendiconto_righe (rapportino_id, mezzo_id)
  where rapportino_id is not null and mezzo_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. «Crea riga» da una voce libera
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.rapportino_voce_recupera(p_voce_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_v record;
begin
  select vl.order_id, vl.company_id, vl.vendita_unitaria, cr.approvato
    into v_v
    from public.rapportino_voci_libere vl
    join public.campo_rapportini cr on cr.id = vl.rapportino_id
   where vl.id = p_voce_id;
  if not found then raise exception 'Voce inesistente' using errcode = '23514'; end if;
  if not coalesce(v_v.approvato, false) then
    raise exception 'Il rapportino non è approvato' using errcode = '23514';
  end if;
  if coalesce(v_v.vendita_unitaria, 0) <= 0 then
    raise exception 'La voce non ha un prezzo di vendita: mettilo prima' using errcode = '23514';
  end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_v.order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_v.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_v.company_id) then
    raise exception 'Non hai il permesso di rendicontare questa voce' using errcode = '42501';
  end if;
  perform public.rapportino_voce_applica(p_voce_id);
  return 1;
end; $function$;

revoke all on function public.rapportino_voce_recupera(uuid) from public, anon;
grant execute on function public.rapportino_voce_recupera(uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. «Crea riga» da un mezzo del rapportino  (Lotto 6)
-- ───────────────────────────────────────────────────────────────────────────
-- Il prezzo esce dalla regola unica del listino, la stessa che propone il
-- prezzo nella rete di sicurezza: eccezione di cantiere → listino del
-- committente → listino generale. `mezzi.tariffa_id` punta a
-- `tariffe_aziendali` (il listino generale), mentre `appalto_rendiconto_righe.tariffa_id`
-- vuole una `appalto_tariffe`: per questo si prende `appalto_tariffa_id` dalla
-- regola, che è il legame al listino del committente quando c'è, e altrimenti
-- la riga nasce libera col prezzo del listino generale.

create or replace function public.rapportino_mezzo_rendiconta(p_rapportino_id uuid, p_mezzo_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_r record; v_mz record; v_esito jsonb; v_prezzo numeric; v_ore numeric; v_nome text;
begin
  select cr.order_id, cr.company_id, cr.data_lavoro, cr.approvato, cr.annullato_at, cr.mezzi_usati
    into v_r
    from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then raise exception 'Rapportino inesistente' using errcode = '23514'; end if;
  if not coalesce(v_r.approvato, false) or v_r.annullato_at is not null then
    raise exception 'Il rapportino non è approvato' using errcode = '23514';
  end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_r.order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_r.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_r.company_id) then
    raise exception 'Non hai il permesso di rendicontare questo mezzo' using errcode = '42501';
  end if;

  select mz.id, mz.tariffa_id, coalesce(nullif(btrim(mz.targa), ''), 'Mezzo') as targa
    into v_mz
    from public.mezzi mz
   where mz.id = p_mezzo_id and mz.company_id = v_r.company_id;
  if not found then raise exception 'Mezzo non trovato in anagrafica' using errcode = '23514'; end if;
  if v_mz.tariffa_id is null then
    raise exception 'Il mezzo non ha una voce di listino per la vendita: impostala sulla scheda del mezzo' using errcode = '23514';
  end if;

  -- le ore e il nome come li ha scritti il cantiere
  select coalesce(nullif(btrim(m->>'nome'), ''), v_mz.targa),
         case when m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'ore', ',', '.')::numeric end
    into v_nome, v_ore
    from jsonb_array_elements(
           case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) m
   where m->>'mezzo_id' = p_mezzo_id::text
   limit 1;
  if v_nome is null then raise exception 'Questo mezzo non è in questo rapportino' using errcode = '23514'; end if;
  if coalesce(v_ore, 0) <= 0 then
    raise exception 'Le ore del mezzo non sono indicate nel rapportino: scrivile, oppure fai la riga a mano' using errcode = '23514';
  end if;

  v_esito := private.prezzo_voce_commessa_raw(v_r.order_id, v_mz.tariffa_id, v_r.data_lavoro);
  v_prezzo := nullif((v_esito->>'prezzo')::numeric, 0);
  if v_prezzo is null then
    raise exception 'Il listino non dà un prezzo per questo mezzo: è «da definire»' using errcode = '23514';
  end if;

  insert into public.appalto_rendiconto_righe (
    order_id, data, tariffa_id, quantita, employee_id, fase_id, origine, rapportino_id,
    stato, descrizione, unita_misura, prezzo_unitario, note, mezzo_id, extra_contratto)
  values (
    v_r.order_id, v_r.data_lavoro,
    case when v_esito->>'appalto_tariffa_id' ~* '^[0-9a-f-]{36}$' then (v_esito->>'appalto_tariffa_id')::uuid end,
    v_ore, null, null, 'rapportino', p_rapportino_id,
    'bozza', v_nome, 'ora', v_prezzo,
    'Mezzo del rapportino', p_mezzo_id, false)
  on conflict do nothing;

  return 1;
end; $function$;

revoke all on function public.rapportino_mezzo_rendiconta(uuid, uuid) from public, anon;
grant execute on function public.rapportino_mezzo_rendiconta(uuid, uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Una voce con un prezzo si può creare: motivo nullo
-- ───────────────────────────────────────────────────────────────────────────
-- Identica alla 20290624100200, cambia solo il CASE delle voci libere.

create or replace function public.rapportino_rimasto_fuori(p_rapportino_id uuid)
 returns table(
   sorgente text,
   riferimento_id uuid,
   descrizione text,
   quantita numeric,
   unita text,
   vendita_proposta numeric,
   motivo text)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare v_r record;
begin
  select cr.order_id, cr.company_id, cr.data_lavoro, cr.approvato, cr.annullato_at,
         cr.mezzi_usati, cr.materiali_usati
    into v_r
    from public.campo_rapportini cr
   where cr.id = p_rapportino_id;
  if not found or not coalesce(v_r.approvato, false) or v_r.annullato_at is not null then
    return;
  end if;
  if not exists (select 1 from public.orders o where o.id = v_r.order_id and o.deleted_at is null) then
    return;
  end if;

  return query
  select 'manodopera'::text,
         c.employee_id,
         coalesce(c.persona, 'Manodopera')::text,
         c.quantita,
         'ora'::text,
         null::numeric,
         c.motivo
    from public.appalto_righe_da_rapportino_calcola(p_rapportino_id) c
   where not exists (
     select 1
       from public.appalto_rendiconto_righe rr
      where (rr.rapportino_id = p_rapportino_id
             and rr.voce_libera_id is null
             and rr.mezzo_id is null
             and rr.employee_id is not distinct from c.employee_id
             and rr.maggiorazione_pct = coalesce(c.maggiorazione_pct, 0))
         or (rr.rapportino_id is null
             and rr.order_id = v_r.order_id
             and rr.data = v_r.data_lavoro
             and c.employee_id is not null
             and rr.employee_id = c.employee_id));

  return query
  select 'voce_libera'::text,
         v.id,
         v.descrizione,
         v.quantita,
         v.unita,
         coalesce(v.vendita_unitaria, v.vendita_proposta),
         case
           when coalesce(v.vendita_unitaria, 0) <= 0
             then 'Prezzo di vendita non indicato: mettilo sulla voce, oppure scrivi la riga a mano'
           -- con un prezzo la riga si può creare: motivo nullo = «Crea riga»
         end
    from public.rapportino_voci_libere v
   where v.rapportino_id = p_rapportino_id
     and not exists (
       select 1 from public.appalto_rendiconto_righe rr where rr.voce_libera_id = v.id);

  return query
  with usati as (
    select case when m->>'mezzo_id' ~* '^[0-9a-f-]{36}$' then (m->>'mezzo_id')::uuid end as mezzo_id,
           coalesce(nullif(btrim(m->>'nome'), ''), 'Mezzo') as nome,
           case when m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'ore', ',', '.')::numeric end as ore
      from jsonb_array_elements(
             case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) m
  ), con_prezzo as (
    select u.*,
           mz.id as mezzo_vero,
           mz.tariffa_id,
           nullif((private.prezzo_voce_commessa_raw(v_r.order_id, mz.tariffa_id, v_r.data_lavoro)->>'prezzo')::numeric, 0) as prezzo
      from usati u
      left join public.mezzi mz on mz.id = u.mezzo_id
  )
  select 'mezzo'::text,
         p.mezzo_id,
         p.nome,
         p.ore,
         'ora'::text,
         p.prezzo,
         case
           when p.mezzo_vero is null then 'Mezzo non più in anagrafica: scrivi la riga a mano'
           when p.tariffa_id is null then 'Il mezzo non ha una voce di listino per la vendita: impostala sulla scheda del mezzo, oppure scrivi la riga a mano'
           when p.prezzo is null then 'Prezzo del mezzo da definire nel listino'
           when coalesce(p.ore, 0) <= 0 then 'Ore del mezzo non indicate nel rapportino'
         end
    from con_prezzo p
   where not exists (
       select 1 from public.rapportino_voci_libere v
        where v.rapportino_id = p_rapportino_id
          and v.viaggio is not null
          and (nullif(btrim(v.viaggio->>'mezzo'), '') is null
               or p.nome ilike '%' || btrim(v.viaggio->>'mezzo') || '%'))
     and not exists (
       select 1 from public.appalto_rendiconto_righe rr
        where rr.rapportino_id = p_rapportino_id
          and rr.mezzo_id is not null
          and rr.mezzo_id is not distinct from p.mezzo_id);

  return query
  with usati as (
    select coalesce(nullif(btrim(m->>'nome'), ''), 'Materiale') as nome,
           case when m->>'quantita' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'quantita', ',', '.')::numeric end as q,
           coalesce(nullif(btrim(m->>'unita'), ''), 'cad') as unita
      from jsonb_array_elements(
             case when jsonb_typeof(v_r.materiali_usati) = 'array' then v_r.materiali_usati else '[]'::jsonb end) m
  )
  select 'materiale'::text, null::uuid, u.nome, u.q, u.unita, null::numeric,
         'I materiali segnati in cantiere non si valorizzano da soli: aggiungili come voce del rapportino, oppure scrivi la riga a mano'::text
    from usati u;
end;
$function$;
