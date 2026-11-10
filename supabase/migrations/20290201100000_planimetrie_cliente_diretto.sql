-- Collegamento diretto al cliente, indipendente dalla commessa e dal contatto CRM.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.planimetrie
  add column if not exists customer_id uuid references public.profiles(id) on delete set null;
comment on column public.planimetrie.customer_id is 'Cliente aziendale della pianta; distinto dal contatto CRM (contact_id).';
create index if not exists planimetrie_customer_idx on public.planimetrie(customer_id) where customer_id is not null;

-- Come gli altri collegamenti della pianta: stessa azienda, e solo profili cliente.
-- Il definer serve a verificare il ruolo anche quando user_roles non è leggibile
-- dall'utente. La funzione è utilizzabile soltanto come trigger.
create or replace function public.planimetrie_cliente_stessa_azienda()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role = 'customer'::public.app_role
    where p.id = new.customer_id and p.company_id = new.company_id
  ) then
    raise exception using errcode = '42501', message = 'Il cliente non appartiene a questa azienda.';
  end if;
  return new;
end $$;
revoke all on function public.planimetrie_cliente_stessa_azienda() from public, anon, authenticated;
drop trigger if exists planimetrie_cliente_stessa_azienda on public.planimetrie;
create trigger planimetrie_cliente_stessa_azienda
  before insert or update of customer_id, company_id on public.planimetrie
  for each row execute function public.planimetrie_cliente_stessa_azienda();

-- Mantiene la RPC esistente per i client già pubblicati. La variante con cliente
-- salva pianta, versione e collegamento nella stessa transazione, con le stesse RLS.
create or replace function public.planimetria_crea_cliente(
  p_company_id uuid, p_titolo text, p_documento jsonb, p_customer_id uuid,
  p_quantita jsonb default null, p_origine text default 'manuale', p_nota text default null,
  p_order_id uuid default null, p_quote_id uuid default null,
  p_computo_upload_id uuid default null, p_survey_id uuid default null, p_contact_id uuid default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  v_id := public.planimetria_crea(p_company_id, p_titolo, p_documento, p_quantita, p_origine, p_nota,
    p_order_id, p_quote_id, p_computo_upload_id, p_survey_id, p_contact_id);
  update public.planimetrie set customer_id = p_customer_id where id = v_id;
  return v_id;
end $$;
revoke all on function public.planimetria_crea_cliente(uuid,text,jsonb,uuid,jsonb,text,text,uuid,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.planimetria_crea_cliente(uuid,text,jsonb,uuid,jsonb,text,text,uuid,uuid,uuid,uuid,uuid) to authenticated, service_role;
