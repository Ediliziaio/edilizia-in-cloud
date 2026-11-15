-- Impostazioni → Automazioni, riquadro «Da fare» (15/11/2026): il lavoro che le regole lasciano a
-- una persona, contato in un posto solo.
--   proposte            collegamenti proposti in attesa di conferma (popup «Verifica collegamenti»)
--   da_ricontrollare    fatture agganciate a un ordine per solo importo prima della regola del 15/11
--   fornitori_senza_tipo fornitori attivi senza tipo (la pagina «Tipi dei fornitori» lo propone)
--   fatture_senza_fornitore / di cui senza P.IVA né codice fiscale (non si può creare il fornitore)
-- Legge chi può collegare i documenti d'acquisto (stessa regola della traccia). Conteggi con gli indici
-- parziali delle fatture senza fornitore (20290404304000).
create or replace function public.acquisti_da_fare(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.acquisti_puo_collegare(p_company) then
    raise exception 'Non hai il permesso di vedere il lavoro degli acquisti.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'proposte', (select count(*) from public.acquisti_collegamenti where company_id = p_company and stato = 'proposto'),
    'da_ricontrollare', (select count(*) from public.acquisti_collegamenti
                          where company_id = p_company and regola = 'oda_importo_fornitore_storico' and stato = 'collegato'),
    'fornitori_senza_tipo', (select count(*) from public.suppliers
                              where company_id = p_company and coalesce(is_active, true) and tipo is null),
    'fatture_senza_fornitore', (select count(*) from public.fatture_ricevute where company_id = p_company and fornitore_id is null),
    'fatture_senza_identificativo', (select count(*) from public.fatture_ricevute
                                      where company_id = p_company and fornitore_id is null
                                        and coalesce(nullif(public.partner_tax_key(cedente_piva), ''), nullif(public.partner_tax_key(cedente_cf), '')) is null)
  );
end $$;
revoke all on function public.acquisti_da_fare(uuid) from public, anon;
grant execute on function public.acquisti_da_fare(uuid) to authenticated, service_role;
