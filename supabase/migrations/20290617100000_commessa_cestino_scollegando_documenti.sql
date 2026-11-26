set local lock_timeout='3s';
set local statement_timeout='60s';
-- Cestino della commessa, seconda conferma (26/11/2026): le commesse nate per sbaglio (doppioni
-- dell'import, «fatture 2026 senza commessa») restavano bloccate per sempre dai documenti collegati.
-- Ora chi ha il permesso può confermare una seconda volta: i documenti che esistono di per sé
-- (fatture emesse e ricevute, DDT, costi, ordini d'acquisto, movimenti di prima nota, scadenze,
-- materiali impegnati) vengono SCOLLEGATI dalla commessa — restano tutti nei loro elenchi, senza
-- commessa, pronti per essere riassegnati — e la commessa va nel cestino.
-- Le righe che sono parte della commessa (rate, articoli, SAL, rapportini, ore) la seguono nel cestino.
-- Lo scollegamento NON si annulla ripristinando la commessa: è scritto nella conferma.

-- ── 1. Cosa si scollegherebbe: i conteggi per la seconda conferma ──────────
create or replace function public.commessa_cosa_si_scollega(p_order_id uuid, p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare o public.orders%rowtype; r jsonb;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode='42501'; end if;
  select * into o from public.orders where id=p_order_id and company_id=p_company_id;
  if not found or public.can_see_order(p_order_id,o.assigned_to,o.destination_warehouse_id) is not true then
    raise exception 'Commessa non trovata o non accessibile.' using errcode='42501';
  end if;
  select jsonb_strip_nulls(jsonb_build_object(
    'fatture_emesse', nullif((select count(*) from public.invoices where order_id=o.id),0),
    'documenti_fiscali', nullif((select count(*) from public.documenti_fiscali where ordine_id=o.id and deleted_at is null),0),
    'fatture_collegate_a_righe', nullif((select count(*) from public.fattura_ordine where ordine_id=o.id),0),
    'rate_con_fattura', nullif((select count(*) from public.order_installments where order_id=o.id and (invoice_id is not null or documento_fiscale_id is not null)),0),
    'costi', nullif((select count(*) from public.company_costs where order_id=o.id),0),
    'costi_ripartiti', nullif((select count(*) from public.company_costs c where c.order_id is distinct from o.id
        and jsonb_typeof(c.allocations)='array' and c.allocations @> jsonb_build_array(jsonb_build_object('order_id',o.id::text))),0),
    'ordini_acquisto', nullif((select count(*) from public.purchase_orders where order_id=o.id),0),
    'ddt', nullif((select count(*) from public.ddt_consegne where order_id=o.id)
                 +(select count(*) from public.ddt_ricezione where order_id=o.id),0),
    'fatture_ricevute', nullif((select count(*) from public.fatture_ricevute where protocollo_commessa_id=o.id or order_id_suggerito=o.id),0),
    'materiali_magazzino', nullif((select count(*) from public.stock_units where reserved_order_id=o.id or delivered_to_order_id=o.id),0),
    'movimenti_magazzino', nullif((select count(*) from public.warehouse_movements where order_id=o.id),0),
    'prima_nota', nullif((select count(*) from public.prima_nota_entries where order_id=o.id),0),
    'scadenze', nullif((select count(*) from public.scadenze where order_id=o.id),0)
  )) into r;
  return coalesce(r,'{}'::jsonb);
end $fn$;
revoke all on function public.commessa_cosa_si_scollega(uuid,uuid) from public, anon;
grant execute on function public.commessa_cosa_si_scollega(uuid,uuid) to authenticated, service_role;
comment on function public.commessa_cosa_si_scollega(uuid,uuid) is
 'Conteggi dei documenti che la seconda conferma scollegherebbe dalla commessa. 20290616100000.';

-- ── 2. Lo scollegamento vero ───────────────────────────────────────────────
create or replace function private.commessa_scollega_documenti(p_order_id uuid, p_company_id uuid)
returns void language plpgsql security definer set search_path to '' as $fn$
begin
  -- Fatture emesse: restano in Fatturazione, senza commessa.
  update public.invoices set order_id=null where order_id=p_order_id and company_id=p_company_id;
  update public.documenti_fiscali set ordine_id=null where ordine_id=p_order_id and company_id=p_company_id;
  delete from public.fattura_ordine where ordine_id=p_order_id and company_id=p_company_id;

  -- Rate ↔ fattura: la rata segue la commessa nel cestino, la fattura no. Dove c'è un incasso in
  -- Prima Nota il legame non si tocca (lo protegge rata_con_incasso_prima_nota): si corregge da lì.
  begin
    update public.order_installments i
       set invoice_id=null, documento_fiscale_id=null,
           documento_quota_lorda=null, documento_quota_offset=null
     where i.order_id=p_order_id
       and (i.invoice_id is not null or i.documento_fiscale_id is not null)
       and not exists (select 1 from public.prima_nota_entries p
                        where p.installment_id=i.id and private.prima_nota_e_incasso_rata(p));
  exception when others then
    raise exception 'Le rate di questa commessa sono collegate a fatture e non si riesce a scollegarle: %. Serve anche il permesso sulle fatture.', sqlerrm
      using errcode='42501';
  end;

  -- Costi: quelli intestati alla commessa e quelli che la citano nella ripartizione.
  update public.company_costs set order_id=null, order_work_phase_id=null
   where order_id=p_order_id and company_id=p_company_id;
  update public.company_costs c
     set allocations=coalesce((select jsonb_agg(a) from jsonb_array_elements(c.allocations) a
                                where nullif(a->>'order_id','')::uuid is distinct from p_order_id),'[]'::jsonb)
   where c.company_id=p_company_id and jsonb_typeof(c.allocations)='array'
     and c.allocations @> jsonb_build_array(jsonb_build_object('order_id',p_order_id::text));

  -- Acquisti, consegne, magazzino.
  update public.purchase_orders set order_id=null where order_id=p_order_id and company_id=p_company_id;
  update public.ddt_consegne set order_id=null where order_id=p_order_id;
  update public.ddt_ricezione set order_id=null where order_id=p_order_id;
  update public.stock_units set reserved_order_id=case when reserved_order_id=p_order_id then null else reserved_order_id end,
                                delivered_to_order_id=case when delivered_to_order_id=p_order_id then null else delivered_to_order_id end
   where reserved_order_id=p_order_id or delivered_to_order_id=p_order_id;
  update public.warehouse_movements set order_id=null where order_id=p_order_id;

  -- Fatture ricevute: protocollo di cantiere e commessa solo suggerita.
  update public.fatture_ricevute
     set protocollo_commessa_id=case when protocollo_commessa_id=p_order_id then null else protocollo_commessa_id end,
         protocollo_commessa_numero=case when protocollo_commessa_id=p_order_id then null else protocollo_commessa_numero end,
         order_id_suggerito=case when order_id_suggerito=p_order_id then null else order_id_suggerito end
   where company_id=p_company_id and (protocollo_commessa_id=p_order_id or order_id_suggerito=p_order_id);

  -- Soldi e scadenze registrati fuori dalla commessa.
  update public.prima_nota_entries set order_id=null where order_id=p_order_id;
  update public.scadenze set order_id=null where order_id=p_order_id;

  raise log 'commessa %: documenti scollegati prima del cestino da %', p_order_id, coalesce(auth.uid()::text,'—');
end $fn$;
revoke all on function private.commessa_scollega_documenti(uuid,uuid) from public, anon, authenticated;

-- ── 3. set_order_trashed: quarto parametro, la seconda conferma ────────────
-- La vecchia firma a 3 parametri sparisce: tenerla accanto a quella col default renderebbe
-- ambigua ogni chiamata a tre argomenti («function is not unique»).
DROP FUNCTION IF EXISTS public.set_order_trashed(uuid,uuid,boolean);
CREATE OR REPLACE FUNCTION public.set_order_trashed(p_order_id uuid, p_company_id uuid, p_trashed boolean, p_scollega boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders%rowtype;
  superadmin boolean := coalesce(public.has_role(auth.uid(),'super_admin'::public.app_role),false);
  motivo text;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode='42501'; end if;
  if p_company_id is null or p_trashed is null then raise exception 'Azienda e operazione obbligatorie.' using errcode='22023'; end if;
  if p_company_id is distinct from public.get_my_company_id()
     and not superadmin then
    raise exception 'Azienda non valida per l''operazione.' using errcode='42501';
  end if;
  if not superadmin
    and (public.utente_bloccato() or public.utente_e_cliente_esterno()
      or not coalesce(p_company_id = any(public.aziende_con_permesso('can_delete_orders')),false)) then
    raise exception 'Non hai il permesso di eliminare le commesse (chiedi all''amministratore).' using errcode='42501';
  end if;
  select * into o from public.orders where id=p_order_id and company_id=p_company_id for update;
  if not found or public.can_see_order(p_order_id,o.assigned_to,o.destination_warehouse_id) is not true then
    raise exception 'Commessa non trovata o non accessibile.' using errcode='42501';
  end if;
  if (o.deleted_at is not null)=p_trashed then return; end if;
  if p_trashed then
    -- Le scadenze non pagate sono previsioni: restano conservate nel cestino. Ciò che è già successo
    -- (incassi, fatture, costi, acquisti, SAL, rapportini) tiene la commessa nello storico: si dice cosa.
    motivo := case
      when coalesce((to_jsonb(o)->>'deposit_paid')::boolean,false) or coalesce((to_jsonb(o)->>'deposit_2_paid')::boolean,false)
        or coalesce((to_jsonb(o)->>'balance_paid')::boolean,false) or coalesce((to_jsonb(o)->>'financing_paid')::boolean,false)
        or exists(select 1 from public.order_installments where order_id=o.id and (is_paid or invoice_id is not null or documento_fiscale_id is not null))
        then 'ci sono rate già incassate o fatturate (Economia → Piano pagamenti)'
      when exists(select 1 from public.invoices where order_id=o.id)
        or exists(select 1 from public.documenti_fiscali where ordine_id=o.id and deleted_at is null)
        or exists(select 1 from public.fattura_ordine where ordine_id=o.id)
        then 'ci sono fatture collegate (Fatturazione)'
      when exists(select 1 from public.sal_records where order_id=o.id and coalesce(stato,'bozza')<>'bozza')
        then 'ci sono SAL del cliente già emessi (SAL e verbali)'
      when exists(select 1 from public.sal_subappaltatori where order_id=o.id)
        then 'ci sono SAL dei subappaltatori (Subappaltatori → SAL)'
      when exists(select 1 from public.contratti_subappalto where order_id=o.id)
        then 'ci sono contratti di subappalto (Ditte e contratti)'
      when exists(select 1 from public.company_costs where order_id=o.id)
        or exists(select 1 from public.company_costs c where jsonb_typeof(c.allocations)='array'
                   and c.allocations @> jsonb_build_array(jsonb_build_object('order_id', o.id::text)))
        then 'ci sono costi registrati o ripartiti su questa commessa (Materiali e acquisti → Fatture e costi)'
      when exists(select 1 from public.purchase_orders where order_id=o.id)
        then 'ci sono ordini d''acquisto (Materiali e acquisti)'
      when exists(select 1 from public.stock_units where reserved_order_id=o.id or delivered_to_order_id=o.id)
        then 'ci sono materiali di magazzino impegnati o consegnati'
      when exists(select 1 from public.order_items i where order_id=o.id and (
          coalesce((to_jsonb(i)->>'is_paid')::boolean,false) or coalesce((to_jsonb(i)->>'deposit_paid')::boolean,false)
          or coalesce((to_jsonb(i)->>'balance_paid')::boolean,false)))
        then 'ci sono articoli già pagati'
      when exists(select 1 from public.order_employees where order_id=o.id and (hours_worked>0 or total_cost>0))
        then 'ci sono ore o costi del personale registrati'
      when exists(select 1 from public.order_external_teams t where order_id=o.id and (total_cost>0 or coalesce((to_jsonb(t)->>'is_paid')::boolean,false)))
        then 'ci sono costi o pagamenti delle ditte registrati'
      when exists(select 1 from public.order_salespeople where order_id=o.id and is_paid)
        then 'ci sono provvigioni già pagate'
      when exists(select 1 from public.campo_rapportini where order_id=o.id and stato in ('inviato','approvato'))
        then 'ci sono rapportini inviati o approvati'
    end;
    -- Seconda conferma: i documenti che esistono di per sé vengono scollegati e restano nei loro
    -- elenchi, senza commessa. Chi ha il permesso di eliminare le commesse decide.
    if motivo is not null and coalesce(p_scollega,false) then
      perform private.commessa_scollega_documenti(o.id, p_company_id);
      motivo := null;
    end if;
    if motivo is not null then
      raise exception 'Questa commessa non va nel cestino: %. Mantienila nello storico (puoi chiuderla o archiviarla): non è una commessa vuota creata per errore.', motivo;
    end if;
    if exists(select 1 from public.orders where parent_contract_id=o.id and deleted_at is null) then
      raise exception 'Il contratto ha interventi attivi: gestisci prima gli interventi collegati.';
    end if;
  elsif o.parent_contract_id is not null and exists(select 1 from public.orders where id=o.parent_contract_id and deleted_at is not null) then
    raise exception 'Ripristina prima il contratto principale.';
  end if;
  update public.orders set deleted_at=case when p_trashed then now() else null end,
    deleted_by=case when p_trashed then auth.uid() else null end where id=o.id and company_id=p_company_id;
end;
$function$;
revoke all on function public.set_order_trashed(uuid,uuid,boolean,boolean) from public, anon;
grant execute on function public.set_order_trashed(uuid,uuid,boolean,boolean) to authenticated, service_role;
