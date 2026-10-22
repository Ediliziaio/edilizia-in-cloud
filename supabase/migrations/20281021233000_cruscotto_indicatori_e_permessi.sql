-- Cruscotto aziendale: «I numeri che comandano» calcolati nel database, e chi
-- vede il Cruscotto vede tutti i suoi numeri.
--
-- Analisi del 21/10/2026 (Demo Azienda, controllata sui dati):
--   · «Quota primo cliente» sommava le note di credito al fatturato (67.999 €
--     invece di 53.580 €): la lettura dalla pagina non filtrava il tipo di
--     documento né il cestino. Su tutta la piattaforma 5 aziende, 581.612 € di
--     note di credito contate come fatturato. E leggeva solo le fatture
--     importate (invoices): chi fattura dall'app (documenti_fiscali) restava a zero;
--   · «Margine di sicurezza» contava le commesse nel cestino (40 commesse,
--     446.323 € su 5 aziende);
--   · «Cantieri chiusi nei tempi» confrontava due date PREVISTE (work_end_date
--     è la fine lavori pianificata): non misurava mai la consegna vera;
--   · le letture avevano .limit(2000/3000) senza ordine, oltre il tetto di 1000
--     righe dell'API.
--
-- cruscotto_indicatori(azienda) restituisce i grezzi; le soglie restano in
-- src/lib/indicatoriGuida.ts. Regole:
--   · fatturato 12 mesi, IVA esclusa = fatture emesse dall'app (documenti_fiscali:
--     fattura/fattura_pa meno nota_credito, non bozza/annullata/rifiutata) + fatture
--     importate (invoices: invoice meno credit_note, non bozza/annullata) che non
--     sono la copia di una fattura dell'app (stesso giorno e stesso totale: la
--     Demo 2 le ha in tutte e due le tabelle, Renova no). Cestino escluso;
--   · venduto 12 mesi = commesse create negli ultimi 12 mesi, fuori dal cestino,
--     con le variazioni approvate: la stessa regola del grafico (cruscotto_trend_12m);
--   · consegna nei tempi = la commessa entra per la PRIMA volta nell'ultima fase
--     del flusso (order_status_history) entro la fine lavori prevista
--     (work_end_date, altrimenti expected_date). Le assistenze non contano;
--   · acconti e saldi incassati negli ultimi 90 giorni (rate pagate), cestino escluso;
--   · apertura → primo ordine fornitore: giorni fra la nascita della commessa
--     (ultimi 6 mesi) e il suo primo ordine non in bozza.
--
-- Permessi: cruscotto_rate_da_incassare, incassato_rate_periodo e
-- cruscotto_trend_12m chiedevano «vedere commesse» o «vedere costi»: chi ha solo
-- il Cruscotto (la pagina lo chiede) vedeva la pagina in errore. Si aggiunge
-- can_view_cruscotto come alternativa, nient'altro cambia. La funzione nuova usa
-- puo_vedere_metrica(azienda, 'finanza'), che comprende il Cruscotto.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
    select o.id, o.created_at, o.work_end_date, o.expected_date,
           coalesce(o.total_amount, 0)
             + coalesce((select sum(coalesce(v.impatto_economico, 0)) from ordini_variazione v
                          where v.order_id = o.id and v.status = 'approvato'), 0) as venduto
      from orders o
     where o.company_id = p_company_id and o.deleted_at is null
  ), ultima_fase as (
    -- la fase finale del flusso (le assistenze sono a parte)
    select s.id from order_statuses s
     where s.company_id = p_company_id and not coalesce(s.is_support_phase, false)
     order by s.position desc limit 1
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
    select oi.type, sum(coalesce(oi.amount, 0)) as importo
      from order_installments oi
      join orders o on o.id = oi.order_id
     where o.company_id = p_company_id and o.deleted_at is null
       and oi.is_paid and oi.paid_date > v_oggi - 90 and oi.paid_date <= v_oggi
     group by oi.type
  )
  select jsonb_build_object(
    'fatturato_12m', coalesce((select sum(imponibile) from fatture), 0),
    'note_credito_12m', coalesce((select -sum(imponibile) from fatture where imponibile < 0), 0),
    'primo_cliente', (select jsonb_build_object('nome', coalesce(nome, 'Cliente senza nome'), 'totale', totale)
                        from per_cliente where totale > 0 order by totale desc limit 1),
    'venduto_12m', coalesce((select sum(venduto) from commesse where created_at > now() - interval '12 months'), 0),
    'chiuse_12m', (select count(*) from chiuse_12m),
    'chiuse_nei_tempi_12m', (select count(*) from chiuse_12m where chiusa_il <= prevista),
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

-- Il permesso del Cruscotto come alternativa, senza riscrivere le funzioni.
-- Rilanciata non lo aggiunge due volte.
do $patch$
declare
  v_def text;
  v_vecchio text;
  v_nuovo text;
  v_firma text;
begin
  foreach v_firma in array array[
    'public.cruscotto_rate_da_incassare(uuid)',
    'public.cruscotto_trend_12m(uuid)',
    'public.incassato_rate_periodo(date,date)'
  ] loop
    v_def := pg_catalog.pg_get_functiondef(v_firma::regprocedure);
    if position('can_view_cruscotto' in v_def) > 0 then
      continue;  -- già fatto
    end if;
    if v_firma = 'public.cruscotto_rate_da_incassare(uuid)' then
      v_vecchio := 'and not coalesce(public.user_can_read_accountant_company(p_company_id), false) then';
      v_nuovo := 'and not coalesce(public.user_can_read_accountant_company(p_company_id), false)'
                 || E'\n     and not coalesce(public.has_permission_for_company(auth.uid(), ''can_view_cruscotto'', p_company_id), false) then';
    elsif v_firma = 'public.cruscotto_trend_12m(uuid)' then
      v_vecchio := 'or coalesce(public.has_permission_for_company(auth.uid(), ''can_view_costs'', p_company_id), false)) then';
      v_nuovo := 'or coalesce(public.has_permission_for_company(auth.uid(), ''can_view_costs'', p_company_id), false)'
                 || E'\n             or coalesce(public.has_permission_for_company(auth.uid(), ''can_view_cruscotto'', p_company_id), false)) then';
    else
      v_vecchio := 'or coalesce(public.has_permission_for_company(auth.uid(), ''can_view_costs'', v_company), false)) then';
      v_nuovo := 'or coalesce(public.has_permission_for_company(auth.uid(), ''can_view_costs'', v_company), false)'
                 || E'\n             or coalesce(public.has_permission_for_company(auth.uid(), ''can_view_cruscotto'', v_company), false)) then';
    end if;
    if (length(v_def) - length(replace(v_def, v_vecchio, ''))) / length(v_vecchio) <> 1 then
      raise exception 'controllo dei permessi di % non trovato una sola volta: funzione cambiata, rivedere la migrazione', v_firma;
    end if;
    execute replace(v_def, v_vecchio, v_nuovo);
  end loop;
end
$patch$;
