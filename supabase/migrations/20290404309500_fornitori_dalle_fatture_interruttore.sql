-- Fornitori dalle fatture: la creazione all'arrivo segue l'interruttore comune (decisione del titolare,
-- 15/11/2026). Acceso: il cedente che non è in rubrica diventa fornitore da solo (regole di 20290404303000,
-- tipo solo se certo) e il fornitore ricorda la fattura da cui è nato. Spento, cioè di base: non si crea
-- niente; il cedente resta tra i mancanti in Fornitori → «Rivedi e crea», dove sceglie l'azienda.
-- I 1.198 fornitori creati dallo storico del 15/11 restano come sono (la colonna nuova per loro è vuota).
set local lock_timeout = '3s';

alter table public.suppliers add column if not exists creato_dalla_fattura_id uuid;
comment on column public.suppliers.creato_dalla_fattura_id is
  'Creato automaticamente all''arrivo di questa fattura ricevuta (interruttore del collegamento automatico acceso). Vuoto se l''ha creato una persona o lo storico del 15/11/2026.';

-- All'arrivo della fattura. Definer: chiama funzioni chiuse al browser. Mai un errore che fermi il salvataggio.
create or replace function public.acquisti_fornitore_automatico_da_fattura()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if new.fornitore_id is not null then return null; end if;
  begin
    -- Spento: niente fornitore nuovo, il cedente lo sceglie l'azienda in «Rivedi e crea».
    if not public.azienda_collegamento_automatico(new.company_id) then return null; end if;
    r := public.acquisti_crea_fornitore_da_cedente(new.company_id,
      coalesce(nullif(public.partner_tax_key(new.cedente_piva), ''), nullif(public.partner_tax_key(new.cedente_cf), '')));
    if r ->> 'esito' = 'creato' then
      update public.suppliers set creato_dalla_fattura_id = new.id
       where id = (r ->> 'id')::uuid and company_id = new.company_id and creato_dalla_fattura_id is null;
    end if;
  exception when others then
    raise log 'acquisti_fornitore_automatico_da_fattura %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.acquisti_fornitore_automatico_da_fattura() from public, anon, authenticated;

-- Per la riga in Impostazioni → Automazioni: l'ultimo fornitore creato da solo e i cedenti che aspettano.
create or replace function public.acquisti_fornitori_automatici_stato(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.acquisti_puo_collegare(p_company) then
    raise exception 'Non hai il permesso di vedere i fornitori dalle fatture.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ultimo_creato', (select max(created_at) from public.suppliers where company_id = p_company and creato_dalla_fattura_id is not null),
    'creati_30_giorni', (select count(*) from public.suppliers
                          where company_id = p_company and creato_dalla_fattura_id is not null and created_at > now() - interval '30 days'),
    'cedenti_mancanti', (select count(distinct coalesce(nullif(public.partner_tax_key(cedente_piva), ''), nullif(public.partner_tax_key(cedente_cf), '')))
                           from public.fatture_ricevute where company_id = p_company and fornitore_id is null));
end $$;
revoke all on function public.acquisti_fornitori_automatici_stato(uuid) from public, anon;
grant execute on function public.acquisti_fornitori_automatici_stato(uuid) to authenticated, service_role;
