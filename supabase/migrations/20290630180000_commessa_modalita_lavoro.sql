-- Come si lavora una commessa: quattro modi, scritti sulla commessa
-- ─────────────────────────────────────────────────────────────────
-- 28/11/2026, lotto 2 del modello (docs/modello-avanzamento-rendiconto-sal-20261128.md §4).
--
-- Oggi l'app indovina come si lavora una commessa da quello che le trovi attaccato: se ha le voci
-- del computo mostra il SAL verbale, se ha un contratto d'appalto mostra il rendiconto, e un
-- preventivo ad acconto e saldo non mostra né l'uno né l'altro. Funziona finché nessuno ha tutt'e
-- due, e non funziona più nel caso che il titolare ha descritto (appalto con un computo da seguire
-- E gli extra in economia): l'app non sa quale dei due documenti deve proporre.
--
-- Da qui la modalità sta scritta sulla commessa:
--
--   `semplice`              lavoro ad acconto e saldo: si fatturano le rate. È il valore di partenza.
--   `computo`               si misura sul computo: si fattura il SAL verbale.
--   `economia`              si lavora a listino: si fattura il rendiconto del periodo.
--   `computo_ed_economia`   il computo comanda (SAL), il rendiconto porta solo gli extra.
--
-- RIEMPITA UNA VOLTA, da quello che c'è adesso. Dal censimento del 28/11/2026, su 1.215 commesse:
-- 22 `computo`, 8 `economia`, 0 `computo_ed_economia` (va costruito), tutto il resto `semplice`.
--
-- Due cose che il censimento ha detto e il modello non diceva:
--  * **147 commesse «semplici» hanno un SAL verbale.** Il SAL a percentuale sulle fasi lo usa anche
--    chi non ha un computo. La modalità quindi decide che cosa l'app PROPONE, non che cosa vieta:
--    nessuna scheda viene nascosta a chi la sta già usando.
--  * `order_type` ('cliente' / 'appaltatore_lavoro') dice con chi si lavora, non come si misura:
--    84 commesse sono in appalto, ma solo 8 hanno tariffe o rendiconti. Sono due cose diverse e
--    restano due colonne diverse.
--
-- La modalità si cambia finché la commessa non ha documenti emessi: un SAL verbale non più in
-- bozza, un rendiconto del periodo non più in bozza, una fattura che non sia bozza o annullata.
-- Dopo, cambiarla vorrebbe dire rileggere con un'altra regola numeri già mandati al committente.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- 1. La colonna ──────────────────────────────────────────────────────────────────────────────────
alter table public.orders
  add column if not exists modalita_lavoro text not null default 'semplice';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_modalita_lavoro_valida') then
    alter table public.orders add constraint orders_modalita_lavoro_valida
      check (modalita_lavoro in ('semplice', 'computo', 'economia', 'computo_ed_economia'));
  end if;
end $$;

comment on column public.orders.modalita_lavoro is
  'Come si misura e si fattura: semplice (rate) | computo (SAL verbale) | economia (rendiconto del periodo) | computo_ed_economia (SAL per il computo, rendiconto per gli extra). Decide che cosa l''app propone, non che cosa vieta.';

-- Ridondante oggi (su `orders` authenticated ha il GRANT di tabella, che comprende ogni colonna),
-- ma messo perché un GRANT per colonna aggiunge e non toglie: se un domani `orders` passasse ai
-- permessi per colonna come `order_work_phases`, questa colonna sarebbe già dentro.
grant select (modalita_lavoro), update (modalita_lavoro) on public.orders to authenticated;

-- 2. Che modalità direbbero i dati ───────────────────────────────────────────────────────────────
-- Una sola definizione, usata dal riempimento e dal suggerimento all'interfaccia.
create or replace function private.commessa_modalita_dalle_cose(p_order uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with o as (select id, appalto_contratto_id from public.orders where id = p_order),
  c as (
    select exists (
      select 1 from public.order_work_phase_voci v
        join public.order_work_phases f on f.id = v.phase_id
       where f.order_id = p_order and coalesce(v.quantita, 0) > 0) as si
  ),
  e as (
    select exists (select 1 from public.appalto_sal a where a.order_id = p_order)
        or exists (select 1 from public.appalto_tariffe_commessa t where t.order_id = p_order)
        or exists (select 1 from o where o.appalto_contratto_id is not null) as si
  )
  select jsonb_build_object(
    'ha_computo', c.si,
    'ha_economia', e.si,
    'modalita', case when c.si and e.si then 'computo_ed_economia'
                     when c.si then 'computo'
                     when e.si then 'economia'
                     else 'semplice' end)
  from c, e;
$function$;

revoke all on function private.commessa_modalita_dalle_cose(uuid) from public, anon, authenticated;

-- 3. Documenti già mandati fuori ─────────────────────────────────────────────────────────────────
create or replace function private.commessa_ha_documenti_emessi(p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.sal_records s
                  where s.order_id = p_order and coalesce(s.stato, 'bozza') <> 'bozza')
      or exists (select 1 from public.appalto_sal a
                  where a.order_id = p_order and coalesce(a.stato, 'bozza') <> 'bozza')
      or exists (select 1 from public.documenti_fiscali d
                  where d.ordine_id = p_order
                    and coalesce(d.stato::text, 'bozza') not in ('bozza', 'annullata'));
$function$;

revoke all on function private.commessa_ha_documenti_emessi(uuid) from public, anon, authenticated;

-- 4. Riempimento, una volta sola ─────────────────────────────────────────────────────────────────
-- A lotti: `orders` è la tabella più trafficata del progetto e ha 44 trigger. Si muovono solo le
-- commesse ancora al valore di partenza che i dati dicono diverse, quindi un secondo giro non
-- trova più niente da fare. Da qui in avanti la modalità la decide una persona, non la deduzione.
-- Il lotto scorre per `id`, non «le prime 200 ancora da fare»: un filtro del genere ripescherebbe
-- sempre le stesse e si fermerebbe al primo lotto in cui non c'è niente da muovere.
do $$
declare v_ids uuid[]; v_off int := 0; tot int := 0;
begin
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '60s', true);
  loop
    select array_agg(t.id) into v_ids
      from (select o.id from public.orders o order by o.id offset v_off limit 200) t;
    exit when v_ids is null;
    with da_fare as (
      select x.id, private.commessa_modalita_dalle_cose(x.id)->>'modalita' as m
        from unnest(v_ids) as x(id)
    ), mosse as (
      update public.orders o set modalita_lavoro = d.m
        from da_fare d
       where o.id = d.id and o.modalita_lavoro = 'semplice' and d.m <> 'semplice'
      returning o.id
    )
    select tot + count(*) into tot from mosse;
    v_off := v_off + 200;
  end loop;
  raise notice 'commesse mosse: %', tot;
end $$;

-- 5. La guardia ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.orders_modalita_lavoro_coerente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.modalita_lavoro is not distinct from old.modalita_lavoro then
    return new;
  end if;
  -- Le funzioni definer, le migrazioni e il service role passano: la regola è per chi scrive
  -- dall'app, come in public.sottofase_guardia().
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and private.commessa_ha_documenti_emessi(new.id) then
    raise exception 'La commessa ha già documenti emessi: come si misura e si fattura non si cambia più.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.orders_modalita_lavoro_coerente() from public, anon, authenticated;

drop trigger if exists trg_orders_modalita_lavoro on public.orders;
create trigger trg_orders_modalita_lavoro
  before insert or update of modalita_lavoro on public.orders
  for each row execute function public.orders_modalita_lavoro_coerente();

-- 6. Quello che l'interfaccia chiede ────────────────────────────────────────────────────────────
-- «Questa commessa ha un computo e sta a 'semplice': vuoi passarla a “computo”?», e se la modalità
-- si può ancora cambiare. Legge solo cosa esiste, nessun importo.
create or replace function public.commessa_modalita_quadro(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_azienda uuid; v_d jsonb; v_mod text;
begin
  select o.company_id, o.modalita_lavoro into v_azienda, v_mod
    from public.orders o where o.id = p_order;
  if v_azienda is null then
    raise exception 'Commessa inesistente.' using errcode = '22023';
  end if;
  perform public.assert_company_access(v_azienda);
  v_d := private.commessa_modalita_dalle_cose(p_order);
  return v_d || jsonb_build_object(
    'modalita', v_mod,
    'suggerita', v_d->>'modalita',
    'si_puo_cambiare', not private.commessa_ha_documenti_emessi(p_order));
end;
$function$;

revoke all on function public.commessa_modalita_quadro(uuid) from public, anon;
grant execute on function public.commessa_modalita_quadro(uuid) to authenticated;

comment on function public.commessa_modalita_quadro(uuid) is
  'Per la scheda della commessa: la modalità di adesso, quella che i dati suggeriscono, e se si può ancora cambiare.';
