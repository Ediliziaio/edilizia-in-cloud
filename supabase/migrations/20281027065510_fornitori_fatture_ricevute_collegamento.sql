-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- L'archivio delle ricevute non è anagrafiche_native: collegamento separato,
-- esplicito e tracciato, senza modificare importi, XML o costi contabilizzati.
set local lock_timeout='3s';
set local statement_timeout='60s';
alter table public.fatture_ricevute add column if not exists fornitore_id uuid references public.suppliers(id);
create index if not exists ricevute_fornitore_fk on public.fatture_ricevute(fornitore_id);
create table public.supplier_receipt_links_log(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
  invoice_id uuid not null references public.fatture_ricevute(id),supplier_id uuid references public.suppliers(id),
  previous_supplier_id uuid references public.suppliers(id),performed_by uuid not null default auth.uid(),created_at timestamptz not null default now()
);
alter table public.supplier_receipt_links_log enable row level security;
create index supplier_receipt_links_company on public.supplier_receipt_links_log(company_id,invoice_id,created_at);
create index supplier_receipt_links_invoice on public.supplier_receipt_links_log(invoice_id);
create index supplier_receipt_links_supplier on public.supplier_receipt_links_log(supplier_id);
create index supplier_receipt_links_previous on public.supplier_receipt_links_log(previous_supplier_id);
revoke all on public.supplier_receipt_links_log from public,anon,authenticated;
grant select,insert on public.supplier_receipt_links_log to authenticated;
create policy receipt_link_read on public.supplier_receipt_links_log for select to authenticated using(not public.utente_bloccato() and public.has_permission_for_company(auth.uid(),'can_view_billing',company_id));
create policy receipt_link_insert on public.supplier_receipt_links_log for insert to authenticated with check(not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and performed_by=auth.uid() and public.has_permission_for_company(auth.uid(),'can_view_billing',company_id) and exists(select 1 from public.fatture_ricevute f where f.id=invoice_id and f.company_id=supplier_receipt_links_log.company_id));

create or replace function public.check_receipt_supplier() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.suppliers%rowtype;
begin
  if tg_op='UPDATE' and new.fornitore_id is not distinct from old.fornitore_id and new.company_id=old.company_id then return new;end if;
  if tg_op='INSERT' and new.fornitore_id is null then return new;end if;
  if coalesce(auth.jwt()->>'role','')<>'service_role' and (auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(new.company_id) or not public.has_permission_for_company(auth.uid(),'can_view_billing',new.company_id)) then raise exception 'Non autorizzato al collegamento delle ricevute';end if;
  if new.fornitore_id is null then return new;end if;
  select * into s from public.suppliers where id=new.fornitore_id and company_id=new.company_id;
  if not found then raise exception 'Fornitore non accessibile';end if;
  if (public.partner_tax_key(new.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(new.cedente_piva)<>public.partner_tax_key(s.vat_number)) or (public.partner_tax_key(new.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(new.cedente_cf)<>public.partner_tax_key(s.fiscal_code)) then raise exception 'Identificativi fiscali discordanti: correggi i dati prima di collegare';end if;
  return new;
end; $$;
create trigger receipt_supplier_check before insert or update of fornitore_id,company_id on public.fatture_ricevute for each row execute function public.check_receipt_supplier();

create or replace function public.collega_fornitore_ricevute(p_company_id uuid,p_invoice_ids uuid[],p_supplier_id uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare r public.fatture_ricevute%rowtype;n integer:=0;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company_id) or not public.has_permission_for_company(auth.uid(),'can_view_billing',p_company_id) then raise exception 'Non autorizzato';end if;
  if coalesce(array_length(p_invoice_ids,1),0) not between 1 and 500 or (select count(distinct x) from unnest(p_invoice_ids) x)<>array_length(p_invoice_ids,1) then raise exception 'Selezione di fatture non valida';end if;
  for r in select * from public.fatture_ricevute where company_id=p_company_id and id=any(p_invoice_ids) order by id for update loop
    if r.fornitore_id is not null and p_supplier_id is not null and r.fornitore_id<>p_supplier_id then raise exception 'Scollega prima il fornitore esistente';end if;
    update public.fatture_ricevute set fornitore_id=p_supplier_id where id=r.id and company_id=p_company_id;
    insert into public.supplier_receipt_links_log(company_id,invoice_id,supplier_id,previous_supplier_id,performed_by) values(p_company_id,r.id,p_supplier_id,r.fornitore_id,auth.uid());
    n:=n+1;
  end loop;
  if n<>array_length(p_invoice_ids,1) then raise exception 'Una o più fatture non sono accessibili: nessun collegamento applicato';end if;
  return n;
end; $$;
revoke all on function public.collega_fornitore_ricevute(uuid,uuid[],uuid) from public,anon;
grant execute on function public.collega_fornitore_ricevute(uuid,uuid[],uuid) to authenticated;
