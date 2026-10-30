-- Fatture ricevute: il fornitore dell'anagrafica si collega da solo (30/10/2026).
--
-- Il 30/10 su 14.320 fatture ricevute una sola era collegata a un fornitore
-- dell'anagrafica: il collegamento si faceva solo a mano (collega_fornitore_ricevute).
-- 1. Il fornitore si collega da solo quando in anagrafica ce n'è UNO con la stessa
--    partita IVA (o codice fiscale) e l'altro identificativo non contraddice la
--    fattura: all'arrivo della fattura, e quando un fornitore viene creato o gli si
--    scrive la partita IVA.
-- 2. Le 824 fatture che hanno già un fornitore unico in anagrafica si collegano ora.
-- (La commessa senza ordine d'acquisto si collega con commessa_collega_fattura_ricevuta,
-- 20281030210000.)
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. Fornitore automatico ─────────────────────────────────────────────────
-- Il fornitore dell'anagrafica con la stessa partita IVA (o, senza, lo stesso
-- codice fiscale), solo se è uno: con due schede uguali decide una persona.
-- E solo se l'altro identificativo non contraddice la fattura: receipt_supplier_check
-- rifiuterebbe il collegamento, e all'arrivo dallo SDI con lui la fattura intera.
create or replace function public.fornitore_unico_per_cedente(p_company_id uuid, p_piva text, p_cf text)
returns uuid
language sql
stable
set search_path = ''
as $$
  with per_piva as (
    select s.id from public.suppliers s
     where s.company_id = p_company_id
       and public.partner_tax_key(p_piva) <> ''
       and public.partner_tax_key(s.vat_number) = public.partner_tax_key(p_piva)
       and (public.partner_tax_key(p_cf) = '' or public.partner_tax_key(s.fiscal_code) = ''
            or public.partner_tax_key(s.fiscal_code) = public.partner_tax_key(p_cf))
  ), per_cf as (
    select s.id from public.suppliers s
     where s.company_id = p_company_id
       and public.partner_tax_key(p_cf) <> ''
       and public.partner_tax_key(s.fiscal_code) = public.partner_tax_key(p_cf)
       and (public.partner_tax_key(p_piva) = '' or public.partner_tax_key(s.vat_number) = ''
            or public.partner_tax_key(s.vat_number) = public.partner_tax_key(p_piva))
  )
  select case
    when (select count(*) from per_piva) = 1 then (select id from per_piva)
    when (select count(*) from per_piva) = 0 and (select count(*) from per_cf) = 1 then (select id from per_cf)
  end;
$$;
revoke all on function public.fornitore_unico_per_cedente(uuid, text, text) from public, anon;
grant execute on function public.fornitore_unico_per_cedente(uuid, text, text) to authenticated, service_role;

-- All'arrivo della fattura (e se cambiano gli identificativi del cedente).
-- Il nome viene prima di receipt_supplier_check: i trigger BEFORE scattano in
-- ordine alfabetico, e il controllo degli identificativi vede il fornitore scelto.
create or replace function public.fattura_ricevuta_fornitore_automatico()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Solo chi potrebbe collegarla a mano (gli importatori col service role, o una
  -- persona che vede la fatturazione): altrimenti receipt_supplier_check
  -- rifiuterebbe la fattura intera.
  if new.fornitore_id is null
     and (coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or (auth.uid() is not null and public.has_permission_for_company(auth.uid(), 'can_view_billing', new.company_id))) then
    new.fornitore_id := public.fornitore_unico_per_cedente(new.company_id, new.cedente_piva, new.cedente_cf);
  end if;
  return new;
end $$;
revoke all on function public.fattura_ricevuta_fornitore_automatico() from public, anon, authenticated;

drop trigger if exists fattura_ricevuta_fornitore_automatico on public.fatture_ricevute;
create trigger fattura_ricevuta_fornitore_automatico
  before insert or update of cedente_piva, cedente_cf on public.fatture_ricevute
  for each row execute function public.fattura_ricevuta_fornitore_automatico();

-- Quando un fornitore nasce o riceve la partita IVA: le sue fatture ancora senza
-- fornitore si collegano. Non deve MAI impedire di salvare il fornitore: chi non
-- vede la fatturazione salva la scheda e basta, e un errore qui si ingoia.
create or replace function public.fornitore_collega_sue_fatture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.vat_number is not distinct from old.vat_number
     and new.fiscal_code is not distinct from old.fiscal_code then
    return null;
  end if;
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and (auth.uid() is null or not public.has_permission_for_company(auth.uid(), 'can_view_billing', new.company_id)) then
    return null;
  end if;
  begin
    -- Prima il confronto diretto delle chiavi (stringhe), poi l'unicità solo
    -- sulle poche fatture che corrispondono.
    update public.fatture_ricevute f
       set fornitore_id = new.id
     where f.company_id = new.company_id
       and f.fornitore_id is null
       and ((public.partner_tax_key(new.vat_number) <> ''
             and public.partner_tax_key(f.cedente_piva) = public.partner_tax_key(new.vat_number))
         or (public.partner_tax_key(new.fiscal_code) <> ''
             and public.partner_tax_key(f.cedente_cf) = public.partner_tax_key(new.fiscal_code)))
       and public.fornitore_unico_per_cedente(f.company_id, f.cedente_piva, f.cedente_cf) = new.id;
  exception when others then
    raise warning 'fornitore_collega_sue_fatture: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.fornitore_collega_sue_fatture() from public, anon, authenticated;

drop trigger if exists fornitore_collega_sue_fatture on public.suppliers;
create trigger fornitore_collega_sue_fatture
  after insert or update of vat_number, fiscal_code on public.suppliers
  for each row execute function public.fornitore_collega_sue_fatture();

-- ─── 2. Le fatture di oggi ───────────────────────────────────────────────────
-- receipt_supplier_check vuole il service role o una persona col permesso: qui
-- è la migrazione, quindi si presenta come service role per questa transazione.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
with candidati as (
  select f.id, (array_agg(s.id))[1] as fornitore, count(*) as quanti
    from public.fatture_ricevute f
    join public.suppliers s
      on s.company_id = f.company_id
     and public.partner_tax_key(s.vat_number) = public.partner_tax_key(f.cedente_piva)
     and (public.partner_tax_key(f.cedente_cf) = '' or public.partner_tax_key(s.fiscal_code) = ''
          or public.partner_tax_key(s.fiscal_code) = public.partner_tax_key(f.cedente_cf))
   where f.fornitore_id is null
     and public.partner_tax_key(f.cedente_piva) <> ''
   group by f.id
)
update public.fatture_ricevute f
   set fornitore_id = c.fornitore
  from candidati c
 where c.id = f.id and c.quanti = 1;
