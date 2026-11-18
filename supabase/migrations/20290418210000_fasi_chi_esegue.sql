-- Chi fa la fase (17/11/2026, lotto 1 di docs/piano-standard-operativo-commessa.md).
--
-- In un cantiere ogni fase la fanno gli operai dell'azienda o una ditta. Con la ditta «chiavi in mano»
-- (fornitura e posa: tipicamente i serramenti in una ristrutturazione) la fase non ha materiali da
-- comprare: ha il costo previsto della ditta, poi la sua fattura. Con la ditta «solo posa» i materiali
-- li compra l'azienda. Finora nessun campo lo diceva, e il fabbisogno proponeva di comprare anche i
-- materiali che la ditta porta da sé (costo doppio).
--
-- 1. order_work_phases.esecuzione: interna | subappalto_fornitura_posa | subappalto_posa | mista (null = non deciso).
--    La tabella ha i permessi di lettura per colonna e la vista order_work_phases_visibili (CLAUDE.md,
--    «Gli importi delle fasi e delle voci»): la colonna nuova va nel GRANT e nella vista.
-- 2. materiali_proposti.motivo: perché una proposta è scartata (es. «la fornisce la ditta»).
-- 3. Il fabbisogno non conta i materiali delle fasi date a una ditta chiavi in mano.
-- Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.order_work_phases add column if not exists esecuzione text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_work_phases_esecuzione_check') then
    alter table public.order_work_phases add constraint order_work_phases_esecuzione_check
      check (esecuzione is null or esecuzione in ('interna', 'subappalto_fornitura_posa', 'subappalto_posa', 'mista'));
  end if;
end $$;
comment on column public.order_work_phases.esecuzione is
  'Chi fa la fase: interna (operai), subappalto_fornitura_posa (ditta chiavi in mano: niente acquisti, costo della ditta), subappalto_posa (ditta, materiali dell''azienda), mista; null = da decidere.';
grant select (esecuzione) on public.order_work_phases to authenticated;

-- La vista: stesse colonne di prima, più esecuzione in fondo. security_invoker va ridetto:
-- CREATE OR REPLACE VIEW lo azzera (lezione del 10/11/2026).
create or replace view public.order_work_phases_visibili with (security_invoker = true) as
 select id, company_id, order_id, name, "position", status, start_date, end_date, notes, created_at, updated_at,
        percentuale, foto_urls, completata_da, completata_il,
        private.fase_importo_venduto(id) as importo_venduto, legacy_order_item_id, esecuzione
   from public.order_work_phases f;

alter table public.materiali_proposti add column if not exists motivo text;

drop function if exists public.materiali_proposti_scarta(uuid, uuid[]);
create or replace function public.materiali_proposti_scarta(p_order uuid, p_ids uuid[], p_motivo text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n integer;
begin
  perform public._materiali_proposti_azienda(p_order);
  update public.materiali_proposti
     set stato = 'scartato', motivo = left(nullif(btrim(p_motivo), ''), 200), deciso_da = auth.uid(), deciso_at = now(), updated_at = now()
   where order_id = p_order and id = any(p_ids) and stato = 'proposto';
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke all on function public.materiali_proposti_scarta(uuid, uuid[], text) from public, anon;
grant execute on function public.materiali_proposti_scarta(uuid, uuid[], text) to authenticated, service_role;

-- Il fabbisogno: fuori i materiali delle fasi chiavi in mano (li porta la ditta).
do $$
declare
  d text := pg_get_functiondef('public._materiali_riconciliazione_righe(uuid, uuid)'::regprocedure);
  vecchio constant text := '       and (p_order is null or oi.order_id = p_order)
  ),
  copertura as (';
  nuovo constant text := '       and (p_order is null or oi.order_id = p_order)
       and not exists (select 1 from public.order_work_phases fx where fx.id = oi.phase_id and fx.esecuzione = ''subappalto_fornitura_posa'')
  ),
  copertura as (';
begin
  if position('fx.esecuzione = ''subappalto_fornitura_posa''' in d) > 0 then
    return;
  end if;
  if position(vecchio in d) = 0 then
    raise exception '_materiali_riconciliazione_righe: il filtro della commessa non è quello atteso';
  end if;
  execute replace(d, vecchio, nuovo);
end $$;
