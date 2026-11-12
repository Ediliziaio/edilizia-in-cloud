-- I momenti che mancavano alle rate, il termine di pagamento e la ritenuta a garanzia (11/11/2026)
--
-- Il preventivo con computo sa dire tre cose che la commessa non sapeva ricevere:
--   · «al raggiungimento del 30% dei lavori» e «a completamento delle strutture», che fino a ieri
--     viaggiavano come un generico «al SAL n» perdendo la condizione scritta nel contratto;
--   · «al collaudo», che diventava «a fine lavori»;
--   · «a 45 giorni data fattura fine mese», che non aveva proprio dove stare: il termine di
--     pagamento esisteva solo come numero in un componente, e in commessa spariva.
-- E la ritenuta a garanzia, che era una frase in un campo libero: ora è un dato della commessa.
--
-- Le rate che ci sono non cambiano: le colonne nuove nascono vuote e i momenti vecchi restano
-- quelli. La funzione che dà la data attesa impara tre regole in più.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Quello che la rata non sapeva dire ───────────────────────────────────
alter table public.order_installments
  add column if not exists trigger_soglia numeric(5,2),
  add column if not exists trigger_fase text,
  add column if not exists termine_giorni smallint not null default 0,
  add column if not exists termine_fine_mese boolean not null default false;

comment on column public.order_installments.trigger_soglia is
  'Per «sal_percentuale»: la percentuale di avanzamento che rende esigibile la rata. 11/11/2026.';
comment on column public.order_installments.trigger_fase is
  'Per «fase_completata»: il nome della fase di cantiere che deve essere finita. 11/11/2026.';
comment on column public.order_installments.termine_giorni is
  'Giorni data fattura per pagare (0 = a vista). 11/11/2026.';
comment on column public.order_installments.termine_fine_mese is
  'Il termine scade a fine mese («60 gg fine mese»). 11/11/2026.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_installments_termine_check') then
    alter table public.order_installments
      add constraint order_installments_termine_check
      check (termine_giorni >= 0 and termine_giorni <= 365);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_installments_trigger_soglia_check') then
    alter table public.order_installments
      add constraint order_installments_trigger_soglia_check
      check (trigger_soglia is null or (trigger_soglia > 0 and trigger_soglia <= 100));
  end if;
end $$;

alter table public.order_installments drop constraint if exists order_installments_trigger_evento_check;
alter table public.order_installments
  add constraint order_installments_trigger_evento_check
  check (trigger_evento in (
    'data_fissa', 'firma_contratto', 'accettazione_preventivo', 'merce_magazzino', 'consegna_cantiere',
    'inizio_lavori', 'data_posa', 'sal_numero', 'sal_percentuale', 'fase_completata',
    'fine_lavori', 'collaudo', 'fattura_acconto', 'fattura_saldo', 'stato_commessa'));

-- ── 2. La ritenuta a garanzia della commessa ────────────────────────────────
alter table public.orders
  add column if not exists ritenuta_garanzia jsonb;

comment on column public.orders.ritenuta_garanzia is
  'Ritenuta a garanzia concordata: {percentuale, su: sal|tutte, svincolo: collaudo|mesi, mesi}. '
  'Si trattiene sull''imponibile di ogni pagamento e torna allo svincolo. 11/11/2026.';

-- ── 3. La data attesa impara i momenti nuovi ────────────────────────────────
-- La vista dipende dalla funzione: va tolta prima, e rimessa con i suoi permessi e
-- `security_invoker` (un CREATE OR REPLACE VIEW lo azzera: già costato una fuga di costi).
drop view if exists public.v_rate_commessa_stato;
drop function if exists public.data_attesa_rata(text, date, uuid, uuid, timestamptz, date, date, date, date, uuid, integer);

create or replace function public.data_attesa_rata(
  p_evento text, p_expected_date date, p_status_id uuid, p_order_id uuid,
  p_created_at timestamptz, p_merce date, p_inizio date, p_fine date,
  p_posa date default null, p_quote_id uuid default null, p_numero integer default null,
  p_soglia numeric default null, p_fase text default null)
 returns date
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT CASE coalesce(p_evento, 'data_fissa')
    WHEN 'firma_contratto' THEN p_created_at::date
    WHEN 'accettazione_preventivo' THEN (
      SELECT coalesce(q.signed_at::date, q.updated_at::date) FROM public.quotes q WHERE q.id = p_quote_id
    )
    WHEN 'merce_magazzino' THEN p_merce
    WHEN 'consegna_cantiere' THEN (
      SELECT min(s.arrived_at)::date FROM public.shipments_to_site s
      WHERE s.order_id = p_order_id AND s.arrived_at IS NOT NULL
    )
    WHEN 'inizio_lavori' THEN p_inizio
    WHEN 'data_posa' THEN p_posa
    WHEN 'sal_numero' THEN (
      SELECT min(sl.maturato_il) FROM public.sal_records sl
      WHERE sl.order_id = p_order_id AND sl.maturato_il IS NOT NULL
        AND (p_numero IS NULL OR sl.numero_sal = p_numero)
    )
    -- «Al 30% dei lavori»: il primo SAL maturato con cui l'avanzamento contabilizzato
    -- raggiunge la soglia. Senza un importo di contratto non si può dire, e resta senza data.
    WHEN 'sal_percentuale' THEN (
      SELECT min(s.maturato_il) FROM (
        SELECT sl.maturato_il,
               sum(sl.importo_totale) OVER (ORDER BY sl.numero_sal, sl.maturato_il) AS progressivo
          FROM public.sal_records sl
         WHERE sl.order_id = p_order_id AND sl.maturato_il IS NOT NULL
      ) s
      WHERE p_soglia IS NOT NULL
        AND s.progressivo >= (SELECT o.total_amount FROM public.orders o WHERE o.id = p_order_id) * p_soglia / 100
        AND (SELECT coalesce(o.total_amount, 0) FROM public.orders o WHERE o.id = p_order_id) > 0
    )
    -- «A completamento delle strutture»: quando quella fase del cantiere è chiusa.
    WHEN 'fase_completata' THEN (
      SELECT max(coalesce(f.completata_il::date, f.end_date))
        FROM public.order_work_phases f
       WHERE f.order_id = p_order_id
         AND p_fase IS NOT NULL
         AND lower(btrim(f.name)) = lower(btrim(p_fase))
         AND (f.completata_il IS NOT NULL OR f.status = 'completata')
    )
    WHEN 'fine_lavori' THEN p_fine
    -- Il collaudo non ha ancora una data sua: segue la fine dei lavori, e nel documento
    -- resta scritto «al collaudo», che è la condizione firmata.
    WHEN 'collaudo' THEN p_fine
    WHEN 'fattura_acconto' THEN (
      SELECT min(inv.issue_date) FROM public.invoices inv
      WHERE inv.order_id = p_order_id AND coalesce(inv.document_type, 'invoice') <> 'credit_note'
    )
    WHEN 'fattura_saldo' THEN (
      SELECT max(inv.issue_date) FROM public.invoices inv
      WHERE inv.order_id = p_order_id AND coalesce(inv.document_type, 'invoice') <> 'credit_note'
    )
    WHEN 'stato_commessa' THEN (
      SELECT min(h.changed_at)::date FROM public.order_status_history h
      WHERE h.order_id = p_order_id AND h.status_id = p_status_id
    )
    ELSE p_expected_date
  END;
$function$;

revoke all on function public.data_attesa_rata(text, date, uuid, uuid, timestamptz, date, date, date, date, uuid, integer, numeric, text) from public;
grant execute on function public.data_attesa_rata(text, date, uuid, uuid, timestamptz, date, date, date, date, uuid, integer, numeric, text) to authenticated, service_role;

-- ── 4. Il trigger che scrive la data attesa passa anche soglia e fase ───────
create or replace function public.rata_data_da_evento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o record;
begin
  if new.trigger_evento = 'data_fissa' or new.is_paid then
    return new;
  end if;
  select c.id, c.created_at, c.warehouse_arrival_date, c.work_start_date, c.work_end_date, c.expected_date, c.quote_id
    into o from public.orders c where c.id = new.order_id;
  if not found then
    return new;
  end if;
  new.expected_date := public.data_attesa_rata(new.trigger_evento, new.expected_date, new.trigger_status_id, o.id,
                                               o.created_at, o.warehouse_arrival_date, o.work_start_date,
                                               o.work_end_date, o.expected_date, o.quote_id, new.trigger_numero,
                                               new.trigger_soglia, new.trigger_fase);
  return new;
end;
$function$;

-- ── 5. La vista torna com'era, con i campi nuovi ───────────────────────────
create view public.v_rate_commessa_stato as
 SELECT i.id,
    i.order_id,
    o.company_id,
    o.order_code,
    o.description AS commessa,
    o.customer_id,
    i."position",
    i.label,
    i.type,
    i.amount,
    i.is_paid,
    i.paid_date,
    i.expected_date,
    i.trigger_evento,
    i.trigger_status_id,
    i.trigger_numero,
    i.trigger_soglia,
    i.trigger_fase,
    i.termine_giorni,
    i.termine_fine_mese,
    i.importo_da_misurare,
    i.giorni_preavviso,
    d.data_attesa,
    d.data_attesa - CURRENT_DATE AS giorni_all_evento,
        CASE
            WHEN i.is_paid THEN 'pagata'::text
            WHEN d.data_attesa IS NULL THEN 'senza_data'::text
            WHEN d.data_attesa <= CURRENT_DATE THEN 'scaduta'::text
            WHEN d.data_attesa <= (CURRENT_DATE + i.giorni_preavviso) THEN 'preavviso'::text
            ELSE 'ok'::text
        END AS stato_incasso
   FROM order_installments i
     JOIN orders o ON o.id = i.order_id
     CROSS JOIN LATERAL ( SELECT data_attesa_rata(i.trigger_evento, i.expected_date, i.trigger_status_id, o.id,
                                 o.created_at, o.warehouse_arrival_date, o.work_start_date, o.work_end_date,
                                 o.expected_date, o.quote_id, i.trigger_numero, i.trigger_soglia, i.trigger_fase) AS data_attesa) d;

alter view public.v_rate_commessa_stato set (security_invoker = on);
grant all on public.v_rate_commessa_stato to authenticated, service_role;
