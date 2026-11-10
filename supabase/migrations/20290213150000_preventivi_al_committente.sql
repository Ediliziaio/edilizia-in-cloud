-- Preventivi al committente dalla scheda committente (10/11/2026, approvato da Florin).
--
-- Il preventivo resta quello classico (quotes + quote_items, stessa numerazione, stesso invio, stessa firma).
-- Mancava solo il legame col committente: oggi un preventivo si lega a un contatto CRM (contact_id) o, nella
-- scheda cliente, all'email scritta in client_email. 129 committenti su 134 non hanno l'email, e quasi nessuno
-- ha un contatto CRM: i loro preventivi non sarebbero comparsi da nessuna parte. Tre colonne:
--
--   · quotes.customer_id    il profilo (cliente o committente) per cui è fatto il preventivo. Lo scrive il
--                           preventivatore quando lo si apre da una scheda; la copia e la revisione lo tengono;
--                           converti-preventivo-cantiere lo porta sulla commessa (orders.customer_id).
--                           Deve essere un profilo della stessa azienda del preventivo (trigger qui sotto).
--   · quotes.refused_motivo perché è stato rifiutato: prezzo, tempi, altro. Il testo libero resta in refused_reason.
--   · quotes.variante_id    accettato e diventato un lavoro extra su una commessa già aperta (ordini_variazione):
--                           il preventivo non si usa una seconda volta.
--
-- Solo schema: nessuna riga esistente viene toccata.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.quotes add column if not exists customer_id uuid references public.profiles(id) on delete set null;
alter table public.quotes add column if not exists refused_motivo text;
alter table public.quotes add column if not exists variante_id uuid references public.ordini_variazione(id) on delete set null;

alter table public.quotes drop constraint if exists quotes_refused_motivo_check;
alter table public.quotes add constraint quotes_refused_motivo_check
  check (refused_motivo is null or refused_motivo in ('prezzo', 'tempi', 'altro'));

create index if not exists quotes_customer_id_idx on public.quotes (company_id, customer_id)
  where customer_id is not null and deleted_at is null;
create unique index if not exists quotes_variante_id_unico on public.quotes (variante_id) where variante_id is not null;

comment on column public.quotes.customer_id is
  'Il profilo (cliente o committente) per cui è fatto il preventivo. Stessa azienda del preventivo.';
comment on column public.quotes.refused_motivo is 'Perché il preventivo è stato rifiutato: prezzo, tempi, altro. Il testo in refused_reason.';
comment on column public.quotes.variante_id is 'Il lavoro extra (ordini_variazione) nato da questo preventivo accettato.';

-- Il profilo e la variante devono essere dell'azienda del preventivo: un id di un'altra azienda scritto a mano
-- legherebbe il preventivo a uno storico che non è suo.
create or replace function public.tg_quotes_cliente_stessa_azienda()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.customer_id is not null
     and (tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id or new.company_id is distinct from old.company_id)
     and not exists (select 1 from public.profiles p where p.id = new.customer_id and p.company_id = new.company_id) then
    raise exception 'Il cliente scelto non è di questa azienda.' using errcode = '42501';
  end if;
  if new.variante_id is not null
     and (tg_op = 'INSERT' or new.variante_id is distinct from old.variante_id)
     and not exists (select 1 from public.ordini_variazione v where v.id = new.variante_id and v.company_id = new.company_id) then
    raise exception 'Il lavoro extra scelto non è di questa azienda.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.tg_quotes_cliente_stessa_azienda() from public, anon, authenticated;

drop trigger if exists trg_quotes_cliente_stessa_azienda on public.quotes;
create trigger trg_quotes_cliente_stessa_azienda
  before insert or update of customer_id, variante_id, company_id on public.quotes
  for each row execute function public.tg_quotes_cliente_stessa_azienda();
