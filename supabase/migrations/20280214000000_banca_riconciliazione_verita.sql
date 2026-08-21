-- La riconciliazione bancaria diceva bugie in tre punti. Da oggi dice la verità.
--
-- 1) L'auto-match delle USCITE non ha mai lasciato traccia: inseriva in
--    bank_reconciliations solo scadenza_id, ma invoice_id era NOT NULL →
--    l'insert falliva in silenzio e la scadenza veniva comunque marcata
--    pagata. Pagamenti fornitori senza audit e non stornabili.
-- 2) Il Controllo di Gestione contava due volte il costo riconciliato dalla
--    pagina Costi: la vista escludeva le uscite legate a scadenze/fatture ma
--    non quelle legate a un costo (linked_cost_id, che ora viene scritto).
-- 3) I dati demo (e qualunque dato storico) vivevano nelle colonne LEGACY
--    (reconciled_invoice_id) che nessun codice legge più: la tab
--    Riconciliazione mostrava "Riconciliate 0" con 64 riconciliazioni reali.

-- ── 1. bank_reconciliations accetta anche i match con SOLE scadenze ─────────
alter table public.bank_reconciliations
  alter column invoice_id drop not null;

do $$ begin
  alter table public.bank_reconciliations
    add constraint bank_reconciliations_target_check
    check (invoice_id is not null or scadenza_id is not null);
exception when duplicate_object then null; end $$;

comment on constraint bank_reconciliations_target_check on public.bank_reconciliations is
  'Una riconciliazione deve puntare ad almeno un documento: fattura o scadenza.';

-- ── 2. Il CdG non conta più le uscite già riconciliate a un COSTO ───────────
create or replace view public.v_cg_costi_classificati as
with costi_company as (
  select cc.company_id, coalesce(cc.paid_date, cc.due_date) as data,
         cc.amount as importo, cc.category as source_value, 'company_costs'::text as source_table
  from company_costs cc where cc.amount is not null
),
movimenti_bancari as (
  select bt.company_id, coalesce(bt.value_date, bt.booking_date) as data,
         abs(bt.amount) as importo, bt.category as source_value, 'bank_transactions'::text as source_table
  from bank_transactions bt
  where bt.amount < 0::numeric
    and bt.linked_scadenza_id is null
    and bt.linked_cost_id is null            -- ← il pagamento di un costo già in company_costs
    and not (bt.id in (select br.transaction_id from bank_reconciliations br
                       where br.invoice_id is not null or br.scadenza_id is not null))
)
select u.company_id, u.data, u.importo, u.source_table, u.source_value,
       cl.voce_chiave, cl.macro_voce, cl.tipo,
       extract(year from u.data)::integer as anno, extract(month from u.data)::integer as mese
from (select company_id, data, importo, source_value, source_table from costi_company
      union all
      select company_id, data, importo, source_value, source_table from movimenti_bancari) u
left join cg_classificazione_voci cl
  on cl.company_id = u.company_id and cl.source_table = u.source_table
 and cl.source_value = u.source_value and cl.is_active = true;

-- ── 3. Backfill: le riconciliazioni storiche tornano visibili ───────────────
-- I movimenti con reconciled_invoice_id (colonna legacy che la UI non legge
-- più) passano al modello attuale: linked_invoice_id + riga di registro.
-- Nessun pagamento viene creato o modificato: paid_amount delle fatture è già
-- coerente nei dati storici; qui si rende solo VISIBILE ciò che era già vero.
insert into public.bank_reconciliations
  (company_id, transaction_id, invoice_id, matched_amount, match_type, matched_at, notes)
select bt.company_id, bt.id, bt.reconciled_invoice_id,
       least(abs(bt.amount), i.total),
       'storico',
       coalesce(bt.reconciled_at, bt.created_at),
       'Backfill dal modello legacy (reconciled_invoice_id)'
from public.bank_transactions bt
join public.invoices i on i.id = bt.reconciled_invoice_id
where bt.reconciled_invoice_id is not null
  and bt.linked_invoice_id is null
on conflict (transaction_id) where (unmatched_at is null) do nothing;

update public.bank_transactions bt
   set linked_invoice_id = bt.reconciled_invoice_id
 where bt.reconciled_invoice_id is not null
   and bt.linked_invoice_id is null
   and exists (select 1 from public.invoices i where i.id = bt.reconciled_invoice_id);

-- ── 4. Le regole di categorizzazione funzionano anche per lo staff ──────────
-- La funzione girava con la RLS del chiamante (write = solo admin): per uno
-- staff con permesso Tesoreria non categorizzava nulla, contando comunque le
-- righe come aggiornate. SECURITY DEFINER + guardia esplicita di accesso.
-- Stessa identica logica di matching (contains/equals/starts_with, case
-- sensitivity, priorità, icona): cambia SOLO il contesto di esecuzione.
CREATE OR REPLACE FUNCTION public.apply_bank_categorization_rules(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
  r record;
  t record;
  hay text;
  needle text;
  ok boolean;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  FOR t IN
    SELECT id,
           coalesce(description,'') AS d,
           coalesce(creditor_name,'') AS c,
           coalesce(debtor_name,'') AS db
    FROM public.bank_transactions
    WHERE company_id = p_company_id
      AND (category IS NULL OR category = 'Non categorizzata')
  LOOP
    FOR r IN
      SELECT * FROM public.bank_categorization_rules
      WHERE company_id = p_company_id AND coalesce(auto_apply, true) = true
      ORDER BY priority ASC, created_at ASC
    LOOP
      ok := false;
      FOREACH hay IN ARRAY (
        CASE r.match_field
          WHEN 'description'   THEN ARRAY[t.d]
          WHEN 'creditor_name' THEN ARRAY[t.c]
          WHEN 'debtor_name'   THEN ARRAY[t.db]
          ELSE ARRAY[t.d, t.c, t.db]
        END
      )
      LOOP
        needle := r.match_value;
        IF NOT coalesce(r.is_case_sensitive, false) THEN
          hay := lower(hay); needle := lower(needle);
        END IF;
        IF needle <> '' THEN
          ok := CASE coalesce(r.match_type, 'contains')
            WHEN 'equals'      THEN hay = needle
            WHEN 'starts_with' THEN left(hay, length(needle)) = needle
            ELSE position(needle IN hay) > 0
          END;
        END IF;
        EXIT WHEN ok;
      END LOOP;

      IF ok THEN
        UPDATE public.bank_transactions
          SET category = r.category, category_icon = r.category_icon
          WHERE id = t.id;
        v_count := v_count + 1;
        EXIT; -- prima regola che combacia (priorità più alta) vince
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_bank_categorization_rules(uuid) TO authenticated, service_role;
