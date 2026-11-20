-- Gli stessi permessi della lettura delle fatture: contabilità, tesoreria e commercialista.
set local lock_timeout='3s';
set local statement_timeout='30s';

create or replace function public.fattura_ddt_riepilogo(p_fattura uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare f public.fatture_ricevute%rowtype; piano jsonb; c public.company_costs%rowtype; t private.fattura_ddt_ripartizioni%rowtype; attuale jsonb;
begin
  select * into f from public.fatture_ricevute where id=p_fattura;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
    or not coalesce((f.company_id=public.get_my_company_id() and public.puo_vedere_documenti_fornitore())
      or public.user_can_read_accountant_company(f.company_id) or public.e_super_admin_dentro(f.company_id),false) then
    raise exception 'Non puoi consultare questa fattura.' using errcode='42501';
  end if;
  piano:=private.fattura_ddt_piano(f.id);
  select * into c from public.company_costs where id=f.company_cost_id and company_id=f.company_id;
  select * into t from private.fattura_ddt_ripartizioni where fattura_id=f.id;
  attuale:=jsonb_build_object('order_id',c.order_id,'allocations',coalesce(c.allocations,'[]'::jsonb),
    'quota_magazzino',nullif(c.quota_magazzino,0),'quota_magazzino_righe',c.quota_magazzino_righe);
  return piano || jsonb_build_object('automatico',public.azienda_collegamento_automatico(f.company_id),'senza_costo',c.id is null,
    'allineata',coalesce(attuale=piano->'costo',false),'manuale',coalesce(t.bloccata,false) or coalesce(f.aggancio_oda_manuale,false)
      or (t.fattura_id is not null and (t.cost_id is distinct from c.id or t.applicata<>attuale))
      or (t.fattura_id is null and (c.order_id is not null or jsonb_array_length(coalesce(c.allocations,'[]'))>0 or coalesce(c.quota_magazzino,0)>0)),
    'gestita_altrove',f.purchase_order_id is not null or c.purchase_order_id is not null or c.order_external_team_id is not null
      or (c.id is not null and abs(abs(coalesce(c.amount,0))-(piano->>'base')::numeric)>0.01)
      or exists(select 1 from public.fattura_ricevuta_ordini where fattura_id=f.id)
      or exists(select 1 from public.fatture_ricevute where company_cost_id=f.company_cost_id and id<>f.id));
end $function$;
revoke all on function public.fattura_ddt_riepilogo(uuid) from public,anon;
grant execute on function public.fattura_ddt_riepilogo(uuid) to authenticated;
notify pgrst,'reload schema';
