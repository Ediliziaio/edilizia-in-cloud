-- Le rate del fornitore usano l'accordo scritto in anagrafica quando la fattura non dice niente
-- (lotto 5 di docs/piano-costi-commessa.md, B2, 01/11/2026).
--
-- Prima: una fattura senza DatiPagamento nell'XML (e senza piano da Fatture in Cloud) dava una rata senza
-- scadenza e senza metodo, anche se il fornitore aveva in anagrafica «60 giorni fine mese, RiBa». Il
-- 01/11/2026 le rate aperte senza data erano 51: fuori dal previsionale e dall'avviso delle RiBa.
--
-- Ora, nel ramo «nessuna rata scritta in fattura» di crea_rate_fornitore:
--   · scadenza = data della fattura + termini_giorni del fornitore, a fine mese se termini_fine_mese;
--   · metodo   = quello del costo, altrimenti quello del fornitore.
-- Le rate scritte nell'XML o nel piano della fattura restano quelle: l'accordo vale solo dove la fattura tace.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.scadenza_accordo_fornitore(p_supplier uuid, p_data date)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when s.termini_giorni is null or p_data is null then null
           when coalesce(s.termini_fine_mese, false)
             then (date_trunc('month', p_data + s.termini_giorni) + interval '1 month - 1 day')::date
           else p_data + s.termini_giorni
         end
    from public.suppliers s
   where s.id = p_supplier;
$$;
revoke all on function public.scadenza_accordo_fornitore(uuid, date) from public, anon, authenticated;

create or replace function public.crea_rate_fornitore(p_cost uuid, p_fattura uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.company_costs%rowtype;
  f        public.fatture_ricevute%rowtype;
  v_rate   jsonb := '[]'::jsonb;
  v_r      record;
  v_creati integer := 0;
  v_pagata boolean;
  v_metodo_accordo text;
begin
  select * into c from public.company_costs where id = p_cost;
  if not found then return 0; end if;
  if p_fattura is not null then
    select * into f from public.fatture_ricevute where id = p_fattura;
    if not found then return 0; end if;
    if public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento) then
      return 0;
    end if;
  end if;

  if exists (
    select 1 from public.rate_fornitori r
     where r.company_cost_id = p_cost
       and r.fattura_ricevuta_id is not distinct from p_fattura
  ) then
    return 0;
  end if;

  v_pagata := coalesce(c.is_paid, false);
  -- Il metodo dell'accordo, solo se è uno di quelli che le rate conoscono.
  select case when s.payment_method in ('bonifico', 'contanti', 'carta', 'riba', 'rid', 'assegno', 'altro')
              then s.payment_method end
    into v_metodo_accordo
    from public.suppliers s where s.id = c.supplier_id;

  if p_fattura is not null then
    if f.xml_raw is not null then
      v_rate := public.rate_pagamento_da_xml(f.xml_raw, f.indice_corpo);
    end if;
    if jsonb_array_length(v_rate) = 0 and jsonb_typeof(f.piano_pagamento) = 'array' then
      v_rate := f.piano_pagamento;
    end if;
  end if;

  if jsonb_array_length(v_rate) > 0 then
    for v_r in
      select e, ordinale::int as n
        from jsonb_array_elements(v_rate) with ordinality as x(e, ordinale)
    loop
      insert into public.rate_fornitori
        (company_id, company_cost_id, fattura_ricevuta_id, numero, scadenza, importo,
         metodo, iban, stato, pagata_il, origine)
      values
        (c.company_id, p_cost, p_fattura, v_r.n,
         coalesce((v_r.e->>'scadenza')::date,
                  case when jsonb_array_length(v_rate) = 1
                       then public.scadenza_accordo_fornitore(c.supplier_id, f.data_fattura) end),
         coalesce((v_r.e->>'importo')::numeric,
                  case when jsonb_array_length(v_rate) = 1 then coalesce(f.netto_a_pagare, f.totale_documento) end),
         coalesce(public.metodo_da_codice_mp(v_r.e->>'modalita'), c.payment_method, v_metodo_accordo),
         v_r.e->>'iban',
         case when v_pagata then 'pagata' else 'da_pagare' end,
         case when v_pagata then c.paid_date end,
         case when f.xml_raw is not null then 'xml' else 'fattura' end);
      v_creati := v_creati + 1;
    end loop;
  else
    insert into public.rate_fornitori
      (company_id, company_cost_id, fattura_ricevuta_id, numero, scadenza, importo,
       metodo, stato, pagata_il, origine)
    values
      (c.company_id, p_cost, p_fattura, 1,
       coalesce(nullif(c.due_date, date '9999-12-31'),
                case when p_fattura is not null
                     then public.scadenza_accordo_fornitore(c.supplier_id, f.data_fattura) end),
       coalesce(case when p_fattura is not null then coalesce(f.netto_a_pagare, f.totale_documento) end,
                round(c.amount * (1 + coalesce(c.vat_rate, 0) / 100.0), 2)),
       coalesce(c.payment_method, v_metodo_accordo),
       case when v_pagata then 'pagata' else 'da_pagare' end,
       case when v_pagata then c.paid_date end,
       case when p_fattura is not null then 'fattura' else 'costo' end);
    v_creati := 1;
  end if;

  return v_creati;
end
$$;
revoke all on function public.crea_rate_fornitore(uuid, uuid) from public, anon, authenticated;

-- Le rate aperte senza data o senza metodo che l'accordo del fornitore può completare.
update public.rate_fornitori r
   set scadenza = coalesce(r.scadenza,
                           public.scadenza_accordo_fornitore(c.supplier_id,
                             (select fr.data_fattura from public.fatture_ricevute fr where fr.id = r.fattura_ricevuta_id))),
       metodo   = coalesce(r.metodo, case when s.payment_method in ('bonifico', 'contanti', 'carta', 'riba', 'rid', 'assegno', 'altro')
                                          then s.payment_method end)
  from public.company_costs c
  join public.suppliers s on s.id = c.supplier_id
 where c.id = r.company_cost_id
   and r.stato = 'da_pagare'
   and ((r.scadenza is null and s.termini_giorni is not null and r.fattura_ricevuta_id is not null)
        or (r.metodo is null and s.payment_method in ('bonifico', 'contanti', 'carta', 'riba', 'rid', 'assegno', 'altro')));
