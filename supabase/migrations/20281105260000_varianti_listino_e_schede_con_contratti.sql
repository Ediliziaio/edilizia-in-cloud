set local lock_timeout='3s';
set local statement_timeout='60s';
-- Audit del 31/10/2026. Niente DROP: le regole si aggiungono (le policy permissive si sommano).
--
-- 1) Varianti di costo del listino (tariffa_costi_varianti): erano leggibili e scrivibili solo
--    dall'amministratore. La pagina del listino le offre a chi ha il permesso «Listino e prezzi»
--    (can_edit_settings_pricing), che vedeva «usa solo il costo default» e non poteva crearne; e la
--    commessa (Ditte e contratti) non trovava il prezzo concordato con la ditta per chi vede i costi.
--    Ora: lettura a chi vede i costi, scrittura a chi ha «Listino e prezzi» e vede i costi.
-- 2) Scheda sicurezza del subappaltatore: chi non vede i contratti la poteva eliminare, e i contratti
--    sparivano a catena (on delete cascade) senza che nessuno lo sapesse. Ora una scheda con contratti
--    non si elimina da un utente; restano liberi i lavori di sistema (purga, ripristino: auth.uid() nullo).

do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='tariffa_costi_varianti' and policyname='varianti_lettura_costi') then
  create policy varianti_lettura_costi on public.tariffa_costi_varianti for select to authenticated
   using(company_id = (select public.get_my_company_id())
     and company_id in (select unnest(public.aziende_con_permesso('can_view_costs'))));
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='tariffa_costi_varianti' and policyname='varianti_scrittura_listino') then
  create policy varianti_scrittura_listino on public.tariffa_costi_varianti for all to authenticated
   using(company_id = (select public.get_my_company_id())
     and not (select public.utente_e_cliente_esterno())
     and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
     and company_id in (select unnest(public.aziende_con_permesso('can_view_costs'))))
   with check(company_id = (select public.get_my_company_id())
     and not (select public.utente_e_cliente_esterno())
     and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
     and company_id in (select unnest(public.aziende_con_permesso('can_view_costs'))));
 end if;
end $$;

create or replace function public.subappaltatore_scheda_con_contratti() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and exists(select 1 from public.contratti_subappalto where subappaltatore_id=old.id) then
  raise exception 'Questa ditta ha contratti di subappalto: non si elimina. Elimina o risolvi prima i contratti.' using errcode='23503';
 end if;
 return old;
end $$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgname='subappaltatore_scheda_con_contratti' and tgrelid='public.subappaltatori_sicurezza'::regclass) then
  create trigger subappaltatore_scheda_con_contratti before delete on public.subappaltatori_sicurezza
   for each row execute function public.subappaltatore_scheda_con_contratti();
 end if;
end $$;
