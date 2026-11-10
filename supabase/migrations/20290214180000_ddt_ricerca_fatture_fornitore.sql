-- Prima si prendevano le ultime 1000 fatture dell'azienda e solo dopo si
-- cercava il fornitore: i documenti più vecchi sparivano anche cercando il numero.
-- SECURITY INVOKER: restano applicati privilegi e RLS delle tabelle originali.
create or replace function public.ddt_fatture_fornitore(p_ddt uuid,p_cerca text default '',p_limite integer default 100)
returns table(id uuid,numero_fattura text,data_fattura date,cedente_ragione_sociale text)
language plpgsql stable security invoker set search_path=public as $$
declare d public.ddt_ricezione%rowtype; partita_iva text; ricerca text;
begin
 select * into d from ddt_ricezione where ddt_ricezione.id=p_ddt;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
 or not coalesce(public.user_can_access_company(d.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',d.company_id)
    or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',d.company_id)
    or public.e_super_admin_dentro(d.company_id),false) then
  raise exception 'Non puoi consultare le fatture di questa bolla' using errcode='42501';
 end if;
 select nullif(regexp_replace(upper(coalesce(s.vat_number,'')),'^IT|[^A-Z0-9]','','g'),'') into partita_iva from suppliers s where s.id=d.supplier_id and s.company_id=d.company_id;
 ricerca:=lower(left(btrim(coalesce(p_cerca,'')),200));
 return query
 select f.id,f.numero_fattura::text,f.data_fattura,f.cedente_ragione_sociale::text
 from fatture_ricevute f where f.company_id=d.company_id
 and (f.fornitore_id=d.supplier_id or (partita_iva is not null and regexp_replace(upper(coalesce(f.cedente_piva,'')),'^IT|[^A-Z0-9]','','g')=partita_iva))
 and (ricerca='' or position(ricerca in lower(concat_ws(' ',f.numero_fattura,f.data_fattura::text,to_char(f.data_fattura,'DD/MM/YYYY'))))>0)
 order by f.data_fattura desc nulls last,f.id desc limit least(100,greatest(1,coalesce(p_limite,100)));
end $$;
revoke all on function public.ddt_fatture_fornitore(uuid,text,integer) from public,anon;
grant execute on function public.ddt_fatture_fornitore(uuid,text,integer) to authenticated;
