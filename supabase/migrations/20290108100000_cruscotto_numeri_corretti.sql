-- Numeri del Cruscotto Economico corretti dopo il confronto coi dati veri
-- (08/11/2026).
--
-- Il confronto fra i numeri del Cruscotto e le pagine operative, fatto in SQL
-- su quattro aziende vere, ha trovato due errori nelle funzioni del database:
--
-- 1. «Acconti ÷ saldi (90 gg)» (cruscotto_indicatori, rate_90) sommava
--    order_installments.amount grezzo. Saltava le commesse con acconto e saldo
--    scritti nei campi della commessa, senza righe di rata, e non applicava la
--    regola del saldo (il residuo, con le varianti). Su Ke Bei Serramenti
--    contava 5.327 € di incassi su 15.864 davvero incassati. Ora legge gli
--    incassi da rate_incassi() — la stessa fonte dell'incassato del Cruscotto e
--    del grafico — e il tipo (acconto, saldo) da rate_importi().
--
-- 2. «venduto_12m» (base del margine di sicurezza) non aveva un limite
--    superiore: una commessa con data di creazione futura (Ke Bei, 19/12/2026,
--    31.818 €) entrava nel venduto degli ultimi 12 mesi.
--
-- In più, incassato_rate_periodo(date, date) leggeva l'azienda da
-- get_my_company_id(): con due schede aperte su due aziende diverse (il
-- super admin che ne guarda una) l'incassato era quello dell'azienda scelta per
-- ultima, non di quella sullo schermo. La versione nuova riceve l'azienda,
-- come cruscotto_rate_da_incassare. La vecchia resta per chi la chiama ancora.
--
-- Solo funzioni: nessuna riga scritta.

create or replace function public.cruscotto_indicatori(p_company_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_risultato jsonb;
begin
  perform public.assert_company_access(p_company_id);
  if not public.puo_vedere_metrica(p_company_id, 'finanza') then
    raise exception 'Non hai il permesso di vedere il cruscotto' using errcode = '42501';
  end if;

  with app as (
    -- fatture emesse dall'app, con il segno: la nota di credito toglie
    select d.data_emissione as giorno,
           d.totale_documento as totale,
           case when d.tipo = 'nota_credito' then -1 else 1 end
             * coalesce(d.imponibile_totale, d.subtotale, d.totale_documento - coalesce(d.iva_totale, 0), 0) as imponibile,
           coalesce(nullif(d.cliente_snapshot ->> 'partita_iva', ''), nullif(d.cliente_snapshot ->> 'codice_fiscale', ''),
                    lower(coalesce(nullif(d.cliente_snapshot ->> 'ragione_sociale', ''),
                                   btrim(concat_ws(' ', d.cliente_snapshot ->> 'nome', d.cliente_snapshot ->> 'cognome'))))) as cliente,
           coalesce(nullif(d.cliente_snapshot ->> 'ragione_sociale', ''),
                    nullif(btrim(concat_ws(' ', d.cliente_snapshot ->> 'nome', d.cliente_snapshot ->> 'cognome')), '')) as nome
      from documenti_fiscali d
     where d.company_id = p_company_id and d.deleted_at is null
       and d.tipo in ('fattura', 'fattura_pa', 'nota_credito')
       and coalesce(d.stato, '') not in ('bozza', 'annullata', 'rifiutata')
       and d.data_emissione > v_oggi - 365 and d.data_emissione <= v_oggi
  ), importate as (
    select case when i.document_type = 'credit_note' then -1 else 1 end
             * coalesce(i.subtotal, i.total, 0) as imponibile,
           coalesce(i.client_id::text, nullif(i.client_vat_number, ''), nullif(i.client_fiscal_code, ''), lower(i.client_company_name)) as cliente,
           i.client_company_name as nome
      from invoices i
     where i.company_id = p_company_id and i.deleted_at is null
       and coalesce(i.document_type, 'invoice') in ('invoice', 'credit_note')
       and coalesce(i.status, '') not in ('draft', 'bozza', 'cancelled')
       and i.issue_date > v_oggi - 365 and i.issue_date <= v_oggi
       -- la copia di una fattura dell'app non si conta due volte
       and not exists (select 1 from app a where a.giorno = i.issue_date and abs(a.totale - i.total) < 0.01)
  ), fatture as (
    select imponibile, cliente, nome from app
    union all
    select imponibile, cliente, nome from importate
  ), per_cliente as (
    select coalesce(cliente, '—') as cliente, max(nome) as nome, sum(imponibile) as totale
      from fatture group by 1
  ), commesse as (
    select o.id, o.created_at, o.work_end_date, o.expected_date, o.current_status_id, o.status, o.fulfillment_status,
           coalesce(o.total_amount, 0)
             + coalesce((select sum(coalesce(v.impatto_economico, 0)) from ordini_variazione v
                          where v.order_id = o.id and v.status = 'approvato'), 0) as venduto
      from orders o
     where o.company_id = p_company_id and o.deleted_at is null
       and o.workflow_kind <> 'generale'  -- le commesse generali sono contenitori: i lavori sono dentro
  ), ultima_fase as (
    -- la fase finale del flusso (le assistenze sono a parte)
    select s.id from order_statuses s
     where s.company_id = p_company_id and not coalesce(s.is_support_phase, false)
     order by s.position desc limit 1
  ), aperte as (
    -- lavori ancora da finire, con la regola di classifyWorkOrders (cruscottoMetrics.ts):
    -- fase di assistenza = no; ultima fase del flusso = finita; senza fase, annullate e
    -- completate a mano = no; tutto il resto è aperto
    select c.id
      from commesse c
      left join order_statuses st on st.id = c.current_status_id
     where case
             when st.id is not null and coalesce(st.is_support_phase, false) then false
             when st.id is not null then st.id is distinct from (select id from ultima_fase)
             when coalesce(c.status, '') in ('annullato', 'cancelled', 'canceled') then false
             when c.fulfillment_status = 'completed' or c.status = 'completato' then false
             else true
           end
  ), portafoglio as (
    -- il venduto ancora da fare: preventivo totale (con le variazioni approvate)
    -- per la parte non ancora avanzata, IVA esclusa
    select count(*) as commesse,
           coalesce(sum(greatest(0, coalesce(v.preventivo_totale, 0)
                   * (1 - least(100, greatest(0, coalesce(v.percentuale_avanzamento, 0))) / 100.0))), 0) as valore
      from aperte a
      join v_ordine_marginalita v on v.id = a.id
  ), chiuse as (
    select c.id, coalesce(c.work_end_date, c.expected_date) as prevista,
           (min(h.changed_at) at time zone 'Europe/Rome')::date as chiusa_il
      from commesse c
      join order_status_history h on h.order_id = c.id
      join ultima_fase f on f.id = h.status_id
     group by c.id, c.work_end_date, c.expected_date
  ), chiuse_12m as (
    select * from chiuse where chiusa_il > v_oggi - 365 and chiusa_il <= v_oggi and prevista is not null
  ), primo_oda as (
    select po.order_id, min(po.created_at) as primo
      from purchase_orders po
     where po.company_id = p_company_id and po.order_id is not null and coalesce(po.status, '') <> 'bozza'
     group by po.order_id
  ), rate_90 as (
    -- 08/11/2026: gli incassi veri (rate_incassi: rate e campi della commessa,
    -- saldo come residuo, pagamenti dalle fatture), col tipo da rate_importi
    select ri.type, sum(i.importo) as importo
      from public.rate_incassi(p_company_id) i
      join public.rate_importi(p_company_id) ri on ri.installment_id = i.installment_id
     where i.data > v_oggi - 90 and i.data <= v_oggi
     group by ri.type
  )
  select jsonb_build_object(
    'fatturato_12m', coalesce((select sum(imponibile) from fatture), 0),
    'note_credito_12m', coalesce((select -sum(imponibile) from fatture where imponibile < 0), 0),
    'primo_cliente', (select jsonb_build_object('nome', coalesce(nome, 'Cliente senza nome'), 'totale', totale)
                        from per_cliente where totale > 0 order by totale desc limit 1),
    -- 08/11/2026: niente commesse con data di creazione futura
    'venduto_12m', coalesce((select sum(venduto) from commesse
                              where created_at > now() - interval '12 months' and created_at <= now()), 0),
    'chiuse_12m', (select count(*) from chiuse_12m),
    'chiuse_nei_tempi_12m', (select count(*) from chiuse_12m where chiusa_il <= prevista),
    'portafoglio', (select valore from portafoglio),
    'portafoglio_commesse', (select commesse from portafoglio),
    'acconti_90', coalesce((select importo from rate_90 where type = 'deposit'), 0),
    'saldi_90', coalesce((select importo from rate_90 where type = 'balance'), 0),
    'giorni_firma_ordine', coalesce((
      select jsonb_agg(round((extract(epoch from (p.primo - c.created_at)) / 86400.0)::numeric, 1))
        from commesse c join primo_oda p on p.order_id = c.id
       where c.created_at > now() - interval '183 days' and p.primo >= c.created_at), '[]'::jsonb)
  ) into v_risultato;

  return v_risultato;
end;
$function$;

revoke all on function public.cruscotto_indicatori(uuid) from public, anon;
grant execute on function public.cruscotto_indicatori(uuid) to authenticated, service_role;

-- L'incassato del periodo, per l'azienda che si sta guardando.
create or replace function public.incassato_rate_periodo(p_company_id uuid, p_da date, p_a date)
 returns numeric
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  if auth.uid() is null or public.utente_bloccato()
     or not (coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
             or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company_id), false)
             or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_cruscotto', p_company_id), false)) then
    raise exception 'Non puoi vedere gli incassi di questa azienda.' using errcode = '42501';
  end if;
  return coalesce((select round(sum(x.importo), 2) from public.rate_incassi(p_company_id) x
                    where x.data between p_da and p_a), 0);
end $function$;

revoke all on function public.incassato_rate_periodo(uuid, date, date) from public, anon;
grant execute on function public.incassato_rate_periodo(uuid, date, date) to authenticated, service_role;

comment on function public.incassato_rate_periodo(uuid, date, date) is
  'Incassato delle rate delle commesse fra due date, per l''azienda indicata (Cruscotto Economico). Sostituisce la versione senza azienda, che leggeva get_my_company_id().';
