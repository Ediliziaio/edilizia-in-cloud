-- 15/11/2026, coda dei lotti 1-2 del piano «Clienti privati, aziende e PA».
--
-- 1. Un ufficio PA non cambia ente. Spostandolo, l'ente di partenza teneva in
--    codice_sdi il codice dell'ufficio andato via (trovato dal guardiano degli accessi).
--
-- 2. fish_customer_phone(text, text) eseguibile da authenticated.
--    L'indice fish_customer_phone_lookup_idx su profiles (20290311175000) la calcola a
--    ogni scrittura che tocca l'indice, ma la funzione era chiusa a service_role: dal
--    browser un UPDATE di profiles non «leggero» (telefono, P.IVA, codice fiscale…)
--    falliva con «permission denied for function fish_customer_phone». Scoperto
--    allineando il profilo di un cliente PA. La funzione è pura (IMMUTABLE, SQL, non
--    definer): normalizza un numero di telefono e non legge nessuna tabella.
--    Resta chiusa ad anon.
--
-- Idempotente.

create or replace function public.anagrafica_ufficio_pa_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  az uuid;
begin
  if tg_op = 'UPDATE' and new.anagrafica_id is distinct from old.anagrafica_id then
    raise exception 'Un ufficio non cambia ente: crealo sull''altro ente e disattiva questo' using errcode = '22023';
  end if;
  select a.company_id into az from public.anagrafiche_native a where a.id = new.anagrafica_id;
  if az is null then
    raise exception 'Anagrafica inesistente' using errcode = '23503';
  end if;
  -- L'azienda è sempre quella dell'anagrafica: la regola d'accesso fa il resto.
  new.company_id := az;
  new.codice_univoco_ufficio := upper(regexp_replace(coalesce(new.codice_univoco_ufficio, ''), '\s', '', 'g'));
  new.descrizione := btrim(coalesce(new.descrizione, ''));
  new.updated_at := now();
  if not new.attivo then
    new.predefinito := false;
  end if;
  -- Il primo ufficio attivo di un ente è il predefinito.
  if tg_op = 'INSERT' and new.attivo and not new.predefinito and not exists (
       select 1 from public.anagrafica_uffici_pa u
        where u.anagrafica_id = new.anagrafica_id and u.predefinito and u.id <> new.id) then
    new.predefinito := true;
  end if;
  -- Gli altri smettono di esserlo (il loro trigger, con predefinito = false, non risale qui).
  if new.predefinito then
    update public.anagrafica_uffici_pa u set predefinito = false, updated_at = now()
     where u.anagrafica_id = new.anagrafica_id and u.predefinito and u.id <> new.id;
  end if;
  return new;
end;
$fn$;
revoke all on function public.anagrafica_ufficio_pa_prima() from public, anon, authenticated;

do $grant$
begin
  if to_regprocedure('public.fish_customer_phone(text,text)') is not null then
    grant execute on function public.fish_customer_phone(text, text) to authenticated;
  end if;
end
$grant$;
