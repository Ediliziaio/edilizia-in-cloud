-- 15/11/2026, coda dei lotti 1-2 (uffici PA).
--
-- 1. Un'anagrafica PA con un codice di 6 caratteri ha sempre il suo ufficio
--    predefinito. Il travaso del lotto 2 valeva solo per gli enti di allora: un ente
--    creato dopo (es. «Comune di Prova (PA DEMO lotto 3)» su Demo 2, codice UFXYZ1)
--    restava senza righe e il selettore degli uffici era vuoto. Il trigger lo crea
--    solo se l'ente non ha nessun ufficio: gli uffici già presenti non si toccano.
--    Dentro salva_anagrafica_cliente() non scatta: lì il primo ufficio lo crea la
--    funzione, che preferisce il codice scritto dall'utente a quello vecchio.
-- 2. Recupero per gli enti già in questa situazione (prudente).
-- 3. Regole d'accesso degli uffici come quelle di order_riferimenti_pa: anche
--    l'amministratore con accesso a più aziende (e_amministratore_di) e il super
--    admin; utente_e_cliente_esterno() in (select …), una volta per query.
--
-- Idempotente.

create or replace function public.anagrafica_pa_ufficio_dal_codice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  cod text := upper(btrim(coalesce(new.codice_sdi, '')));
begin
  if coalesce(current_setting('eic.salva_anagrafica_cliente', true), '') = 'on' then
    return null;
  end if;
  if new.tipo_cliente = 'PA' and cod ~ '^[A-Z0-9]{6}$' and cod <> '000000'
     and not exists (select 1 from public.anagrafica_uffici_pa u where u.anagrafica_id = new.id) then
    insert into public.anagrafica_uffici_pa (company_id, anagrafica_id, descrizione, codice_univoco_ufficio, predefinito, note)
    values (new.company_id, new.id, 'Ufficio di fatturazione', cod, true, 'Creato dal codice dell''anagrafica')
    on conflict do nothing;
  end if;
  return null;
end;
$fn$;
revoke all on function public.anagrafica_pa_ufficio_dal_codice() from public, anon, authenticated;

drop trigger if exists trg_anagrafica_pa_ufficio_dal_codice on public.anagrafiche_native;
create trigger trg_anagrafica_pa_ufficio_dal_codice
  after insert or update of tipo_cliente, codice_sdi on public.anagrafiche_native
  for each row execute function public.anagrafica_pa_ufficio_dal_codice();

do $recupero$
begin
  set local lock_timeout = '3s';
  set local statement_timeout = '60s';
  insert into public.anagrafica_uffici_pa (company_id, anagrafica_id, descrizione, codice_univoco_ufficio, predefinito, note)
  select a.company_id, a.id, 'Ufficio di fatturazione', upper(btrim(a.codice_sdi)), true,
         'Creato dal codice dell''anagrafica il 15/11/2026'
    from public.anagrafiche_native a
   where a.tipo_cliente = 'PA'
     and upper(btrim(a.codice_sdi)) ~ '^[A-Z0-9]{6}$'
     and upper(btrim(a.codice_sdi)) <> '000000'
     and not exists (select 1 from public.anagrafica_uffici_pa u where u.anagrafica_id = a.id)
  on conflict do nothing;
end
$recupero$;

drop policy if exists company_isolation on public.anagrafica_uffici_pa;
create policy company_isolation on public.anagrafica_uffici_pa
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
              and not public.utente_sola_lettura(company_id));

drop policy if exists anagrafica_uffici_pa_admin on public.anagrafica_uffici_pa;
create policy anagrafica_uffici_pa_admin on public.anagrafica_uffici_pa
  for all to authenticated
  using ((select public.e_amministratore_di(company_id)))
  with check ((select public.e_amministratore_di(company_id)));

drop policy if exists anagrafica_uffici_pa_super_admin on public.anagrafica_uffici_pa;
create policy anagrafica_uffici_pa_super_admin on public.anagrafica_uffici_pa
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));
