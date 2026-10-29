-- ════════════════════════════════════════════════════════════════════════════
-- Un rapportino è un fatto storico: l'operaio può non essere più in forza
-- ════════════════════════════════════════════════════════════════════════════
-- Correzione a `appalto_riga_da_rapportino` (20281028140000): l'operaio si
-- cercava fra gli ATTIVI (`coalesce(e.is_active, true)`). Ma un rapportino è di
-- quel giorno, non di oggi: se l'operaio ha lasciato l'azienda dopo, resta lui
-- che ha lavorato, con la sua qualifica e il suo costo orario.
--
-- Col filtro, il rapportino di un operaio uscito perdeva la tariffa della sua
-- qualifica (cadeva sulla generica, cioè su un prezzo diverso) e perdeva il
-- costo, quindi anche il margine. Su Demo Azienda quasi tutti gli operai hanno
-- `is_active = false`: è lì che è venuto fuori, provando.
--
-- Restano due o più record per lo stesso utente? Si prende l'attivo, e a parità
-- il più vecchio: una scelta stabile invece di un `limit 1` senza ordine.
--
-- Il resto della funzione è identico. Idempotente, nessuna riga scritta.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.appalto_riga_da_rapportino(p_rapportino_id uuid)
returns table (
  tariffa_id uuid,
  quantita numeric,
  employee_id uuid,
  costo_interno numeric,
  motivo text
)
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_r record;
  v_ord record;
  v_emp record;
  v_t record;
  v_generiche integer;
  v_qta numeric;
begin
  select cr.id, cr.order_id, cr.company_id, cr.user_id, cr.data_lavoro,
         cr.ore_lavorate, cr.role_type
    into v_r
    from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'Rapportino inesistente'::text;
    return;
  end if;

  select o.order_type, o.appalto_contratto_id into v_ord
    from public.orders o where o.id = v_r.order_id and o.deleted_at is null;
  if not found or v_ord.order_type is distinct from 'appaltatore_lavoro' then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'La commessa non e'' in appalto'::text;
    return;
  end if;
  if v_ord.appalto_contratto_id is null then
    return query select null::uuid, null::numeric, null::uuid, null::numeric,
      'La commessa non ha un contratto: senza listino non c''e'' prezzo'::text;
    return;
  end if;
  if coalesce(v_r.ore_lavorate, 0) <= 0 then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'Il rapportino non porta ore'::text;
    return;
  end if;

  -- Chi ha lavorato: dall'utente dell'app al suo record di personale. Niente
  -- filtro su `is_active`: il rapportino e' di quel giorno, non di oggi.
  -- Un rapportino di una ditta esterna non ha un dipendente, e va bene cosi'.
  select e.id, e.qualifica, e.livello_inquadramento, e.costo_orario
    into v_emp
    from public.employees e
   where e.user_id = v_r.user_id and e.company_id = v_r.company_id
   order by coalesce(e.is_active, true) desc, e.created_at
   limit 1;

  select t.id, t.unita_misura into v_t
    from public.appalto_tariffe t
   where t.contratto_id = v_ord.appalto_contratto_id
     and t.tipo = 'manodopera' and t.attivo
     and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
     and (t.valido_al is null or v_r.data_lavoro <= t.valido_al)
     and t.qualifica is not null
     and v_emp.id is not null
     and (lower(btrim(t.qualifica)) = lower(btrim(coalesce(v_emp.qualifica, '')))
       or lower(btrim(t.qualifica)) = lower(btrim(coalesce(v_emp.livello_inquadramento, ''))))
   order by t.ordine
   limit 1;

  if v_t.id is null then
    select count(*) into v_generiche
      from public.appalto_tariffe t
     where t.contratto_id = v_ord.appalto_contratto_id
       and t.tipo = 'manodopera' and t.attivo and t.qualifica is null
       and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
       and (t.valido_al is null or v_r.data_lavoro <= t.valido_al);
    if v_generiche = 1 then
      select t.id, t.unita_misura into v_t
        from public.appalto_tariffe t
       where t.contratto_id = v_ord.appalto_contratto_id
         and t.tipo = 'manodopera' and t.attivo and t.qualifica is null
         and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
         and (t.valido_al is null or v_r.data_lavoro <= t.valido_al);
    elsif v_generiche > 1 then
      return query select null::uuid, null::numeric, v_emp.id, null::numeric,
        'Piu'' di una tariffa di manodopera senza qualifica: scegli tu quale'::text;
      return;
    end if;
  end if;

  if v_t.id is null then
    return query select null::uuid, null::numeric, v_emp.id, null::numeric,
      ('Nessuna tariffa di manodopera per '
        || coalesce(nullif(btrim(coalesce(v_emp.qualifica, v_emp.livello_inquadramento)), ''), 'questo operaio')
        || ' in vigore il ' || to_char(v_r.data_lavoro, 'DD/MM/YYYY'))::text;
    return;
  end if;

  v_qta := case v_t.unita_misura
             when 'ora' then v_r.ore_lavorate
             when 'giornata' then 1
             when 'uomo_giorno' then 1
             else null
           end;
  if v_qta is null then
    return query select null::uuid, null::numeric, v_emp.id, null::numeric,
      ('La tariffa e'' a ' || v_t.unita_misura || ': le ore non si convertono da sole')::text;
    return;
  end if;

  return query select
    v_t.id,
    v_qta,
    v_emp.id,
    case when v_emp.costo_orario is not null and v_emp.costo_orario > 0
         then round(v_r.ore_lavorate * v_emp.costo_orario, 2) end,
    null::text;
end;
$fn$;
revoke all on function public.appalto_riga_da_rapportino(uuid) from public, anon, authenticated;
