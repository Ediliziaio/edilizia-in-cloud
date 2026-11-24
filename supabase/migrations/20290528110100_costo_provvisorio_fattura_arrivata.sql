-- Commessa → Altri costi: un costo registrato «in attesa di fattura» e la fattura che poi arriva dallo SDI.
-- Senza aggancio la stessa spesa si conta due volte (il costo a mano + il costo della fattura contabilizzata).
--
-- costi_commessa_fatture_arrivate(order): per ogni costo della commessa ancora senza fattura (senza_fattura = false,
--   nessuna fattura collegata), le fatture ricevute libere che gli somigliano: stesso fornitore (o fornitore non
--   indicato), totale entro il 3% del lordo, data non più di 30 giorni prima del costo. SECURITY INVOKER.
-- costo_sostituisci_con_fattura(costo, fattura): la fattura entra sulla commessa con commessa_collega_fattura_ricevuta
--   (contabilizzata se non lo è), prende fase e ricevuta del costo a mano, e il costo a mano si cancella.
--   Solo se il costo a mano non è pagato: un pagamento già registrato va abbinato a mano.

create or replace function public.costi_commessa_fatture_arrivate(p_order uuid)
returns table (costo_id uuid, fattura_id uuid, numero_fattura text, data_fattura date, fornitore text, totale numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with costi as (
    select cc.id, cc.company_id, cc.supplier_id, cc.due_date,
           round(cc.amount * (1 + coalesce(cc.vat_rate, 0) / 100), 2) as lordo
      from company_costs cc
     where cc.order_id = p_order
       and coalesce(cc.senza_fattura, false) = false
       and cc.purchase_order_id is null
       and cc.order_external_team_id is null
       and not exists (select 1 from fatture_ricevute f where f.company_cost_id = cc.id)
  )
  select c.id, f.id, f.numero_fattura, f.data_fattura, f.cedente_ragione_sociale, f.totale_documento
    from costi c
    join fatture_ricevute f on f.company_id = c.company_id
   where f.company_cost_id is null
     and f.purchase_order_id is null
     and coalesce(f.stato, '') <> 'rifiutata'
     and (c.supplier_id is null or f.fornitore_id = c.supplier_id)
     and c.lordo > 0
     and abs(abs(f.totale_documento) - c.lordo) <= c.lordo * 0.03
     and (f.data_fattura is null or f.data_fattura >= c.due_date - 30)
   order by c.id, (f.fornitore_id is not distinct from c.supplier_id) desc, abs(abs(f.totale_documento) - c.lordo), f.data_fattura desc
$$;

revoke all on function public.costi_commessa_fatture_arrivate(uuid) from public, anon;
grant execute on function public.costi_commessa_fatture_arrivate(uuid) to authenticated, service_role;

create or replace function public.costo_sostituisci_con_fattura(p_costo uuid, p_fattura uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  c record;
  v_esito jsonb;
  v_nuovo uuid;
begin
  select id, company_id, order_id, is_paid, order_work_phase_id, allegato_path, allegato_nome
    into c from company_costs where id = p_costo for update;
  if not found then raise exception 'Costo non trovato.' using errcode = 'P0002'; end if;
  if not public.puo_registrare_costi(c.company_id) then
    raise exception 'Il tuo ruolo non permette di registrare i costi delle commesse.' using errcode = '42501';
  end if;
  if c.order_id is null then raise exception 'Il costo non è su una commessa.' using errcode = 'P0001'; end if;
  if c.is_paid then
    raise exception 'Il costo è già pagato: abbina il pagamento alla fattura da Economia → Costi.' using errcode = 'P0001';
  end if;
  -- Anche un pagamento parziale (movimento o scadenza non più «da pagare») va abbinato a mano.
  if exists (select 1 from prima_nota_entries where cost_id = c.id)
     or exists (select 1 from scadenze where cost_id = c.id and status::text <> 'da_pagare') then
    raise exception 'Sul costo c''è già un pagamento: abbinalo alla fattura da Economia → Costi.' using errcode = 'P0001';
  end if;
  if exists (select 1 from fatture_ricevute where company_cost_id = c.id) then
    raise exception 'Il costo ha già una fattura.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from fatture_ricevute where id = p_fattura and company_id = c.company_id) then
    raise exception 'Fattura non trovata.' using errcode = 'P0002';
  end if;

  v_esito := public.commessa_collega_fattura_ricevuta(p_fattura, c.order_id);
  v_nuovo := (v_esito ->> 'company_cost_id')::uuid;
  if v_nuovo is null or v_nuovo = c.id then
    raise exception 'La fattura non ha prodotto un costo.' using errcode = 'P0001';
  end if;

  update company_costs
     set order_work_phase_id = coalesce(order_work_phase_id, c.order_work_phase_id),
         allegato_path = coalesce(allegato_path, c.allegato_path),
         allegato_nome = coalesce(allegato_nome, c.allegato_nome),
         updated_at = now()
   where id = v_nuovo;

  -- Le scadenze aperte del costo a mano: senza, resterebbe un debito doppio verso il fornitore.
  delete from scadenze where cost_id = c.id and status::text = 'da_pagare';
  delete from company_costs where id = c.id;

  return v_esito || jsonb_build_object('costo_sostituito', c.id);
end
$$;

revoke all on function public.costo_sostituisci_con_fattura(uuid, uuid) from public, anon;
grant execute on function public.costo_sostituisci_con_fattura(uuid, uuid) to authenticated, service_role;
