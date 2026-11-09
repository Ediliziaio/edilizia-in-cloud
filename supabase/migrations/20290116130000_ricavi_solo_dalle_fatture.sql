-- I ricavi sono le fatture emesse. Le commesse sono portafoglio (9 novembre 2026).
--
-- La vista dei ricavi aveva un secondo ramo: per le aziende che in un anno non
-- hanno nessuna fattura, leggeva `orders.total_amount` e lo chiamava ricavo.
-- L'intenzione era coprire chi non fattura dentro EiC. Il risultato è un numero
-- inventato, e in tre modi:
--
-- 1. prendeva l'intero valore del contratto e lo metteva in UN giorno, quello
--    di inserimento della commessa in EiC. Un'azienda che importa lo storico
--    delle commesse si vede l'intero portafoglio come ricavo del mese
--    dell'import: su un caso vero, decine di milioni in tre settimane di
--    ottobre;
-- 2. non guardava `deleted_at`: 54 commesse cancellate, per oltre un milione
--    di euro, risultavano ricavo. Una di esse era l'unica riga di quell'anno
--    per la sua azienda;
-- 3. il valore del contratto non è il ricavo dell'anno comunque: per un'impresa
--    edile il ricavo è la produzione (SAL, fatture), non l'ordine firmato.
--
-- Da qui: i ricavi restano solo le fatture emesse (le fatture native di EiC
-- sono già specchiate in `invoices`, verificato riga per riga). Il valore delle
-- commesse non si butta via: va in `v_cg_portafoglio_commesse` col suo nome
-- vero, cancellate e bozze escluse, e la pagina lo mostra come portafoglio
-- quando le fatture dell'anno sono zero — invece di spacciarlo per ricavo o,
-- peggio, di mostrare un conto economico vuoto senza spiegare perché.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.v_cg_ricavi_classificati as
select i.company_id,
       i.issue_date as data,
       -- Il segno lo dà il tipo di documento, non l'importo salvato.
       case when i.document_type = 'credit_note' then -1 else 1 end
         * (coalesce(i.total, 0::numeric) - coalesce(i.tax_amount, 0::numeric))
         as importo_imponibile,
       case when i.document_type = 'credit_note' then -1 else 1 end
         * coalesce(i.tax_amount, 0::numeric) as iva_amount,
       i.document_type as invoice_type,
       extract(year from i.issue_date)::integer as anno,
       extract(month from i.issue_date)::integer as mese,
       i.client_id as cliente_id,
       i.order_id,
       -- La colonna resta, con un solo valore: chi la legge non si rompe.
       'invoice'::text as source
  from invoices i
 where (i.status <> all (array['cancelled'::text, 'draft'::text, 'annullata'::text, 'bozza'::text]))
   and i.issue_date is not null
   and i.deleted_at is null;

comment on view public.v_cg_ricavi_classificati is
  'Ricavi del Controllo di Gestione: solo fatture emesse, note di credito col segno meno (09/11/2026). Le commesse stanno in v_cg_portafoglio_commesse: sono portafoglio, non ricavo.';

create or replace view public.v_cg_portafoglio_commesse as
select o.company_id,
       -- Attenzione: è la data di inserimento in EiC, non quella della vendita.
       -- Per questo il portafoglio si mostra come portafoglio e non come ricavo.
       o.created_at::date as data,
       extract(year from o.created_at)::integer as anno,
       extract(month from o.created_at)::integer as mese,
       o.id as order_id,
       o.customer_id as cliente_id,
       o.status,
       coalesce(o.total_amount, 0::numeric) as valore,
       o.work_start_date,
       o.work_end_date
  from orders o
 where o.deleted_at is null
   and coalesce(o.total_amount, 0::numeric) > 0::numeric
   and coalesce(o.status, '') <> 'bozza'
   and o.created_at is not null;

comment on view public.v_cg_portafoglio_commesse is
  'Valore delle commesse non cancellate e non in bozza, per anno di inserimento in EiC. È il portafoglio ordini, non un ricavo.';

alter view public.v_cg_ricavi_classificati set (security_invoker = on);
alter view public.v_cg_portafoglio_commesse set (security_invoker = on);

grant select on public.v_cg_portafoglio_commesse to authenticated;

-- Da dove vengono i ricavi del periodo. La pagina la chiama per dire, quando le
-- fatture sono zero, che il conto economico è vuoto per quel motivo e quanto
-- vale invece il portafoglio.
create or replace function public.cg_ricavi_provenienza(
  p_company_id uuid default null,
  p_anno integer default extract(year from current_date)::integer,
  p_mese_da integer default 1,
  p_mese_a integer default 12
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_fatture_righe integer := 0;
  v_fatture_imponibile numeric(14,2) := 0;
  v_commesse_righe integer := 0;
  v_commesse_valore numeric(14,2) := 0;
begin
  v_company_id := coalesce(p_company_id, public.get_my_company_id());
  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;
  -- Stesso controllo delle altre RPC del Controllo di Gestione.
  if v_company_id <> public.get_my_company_id()
     and not public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    raise exception 'Accesso negato: company_id non autorizzato';
  end if;

  select count(*), coalesce(sum(importo_imponibile), 0)
    into v_fatture_righe, v_fatture_imponibile
    from public.v_cg_ricavi_classificati
   where company_id = v_company_id
     and anno = p_anno
     and mese between p_mese_da and p_mese_a;

  select count(*), coalesce(sum(valore), 0)
    into v_commesse_righe, v_commesse_valore
    from public.v_cg_portafoglio_commesse
   where company_id = v_company_id
     and anno = p_anno
     and mese between p_mese_da and p_mese_a;

  return jsonb_build_object(
    'anno', p_anno,
    'mese_da', p_mese_da,
    'mese_a', p_mese_a,
    'fatture_righe', v_fatture_righe,
    'fatture_imponibile', v_fatture_imponibile,
    'commesse_righe', v_commesse_righe,
    'commesse_valore', v_commesse_valore
  );
end;
$$;

revoke all on function public.cg_ricavi_provenienza(uuid, integer, integer, integer) from public, anon;
grant execute on function public.cg_ricavi_provenienza(uuid, integer, integer, integer) to authenticated;

comment on function public.cg_ricavi_provenienza is
  'Da dove vengono i ricavi del periodo: quante fatture emesse e per quanto, e quanto vale il portafoglio commesse inserito nello stesso periodo.';
