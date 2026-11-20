set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.order_attachments add column if not exists cantiere_tipo text
  check (cantiere_tipo in ('pos', 'psc', 'pimus', 'sicurezza', 'tavole', 'verbali', 'altro'));

create table if not exists public.commessa_qr_cantiere (
  order_id uuid primary key references public.orders(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  documento_ids uuid[] not null,
  revisione uuid not null default gen_random_uuid()
);
-- Il cartello può restare attivo anche quando la sua selezione diventa vuota.
alter table public.commessa_qr_cantiere drop constraint if exists commessa_qr_cantiere_documento_ids_check;
alter table public.commessa_qr_cantiere enable row level security;
revoke all on public.commessa_qr_cantiere from public, anon, authenticated;
grant select, delete on public.commessa_qr_cantiere to authenticated;
grant insert (order_id, documento_ids), update (documento_ids, revisione) on public.commessa_qr_cantiere to authenticated;

create or replace function private.gestisci_qr_cantiere(p_order uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
    and exists (select 1 from public.orders o where o.id = p_order and o.deleted_at is null
      and o.company_id = public.get_effective_company_id()
      and private.office_visible_order(o.id)
      and (public.e_amministratore_di(o.company_id) or public.has_role(auth.uid(), 'super_admin'::public.app_role))
      and not public.utente_sola_lettura(o.company_id));
$$;
revoke all on function private.gestisci_qr_cantiere(uuid) from public, anon;
grant execute on function private.gestisci_qr_cantiere(uuid) to authenticated;

create or replace function private.documento_cantiere_qr_valido(a public.order_attachments)
returns boolean language sql immutable set search_path = ''
as $$
  select coalesce(a.cantiere_tipo is not null and a.access_scope = 'operativo'
    and coalesce(a.stato_revisione, 'approvato') = 'approvato'
    and a.file_url ~ ('^(orders/)?' || a.order_id::text || '/[A-Za-z0-9._-]+$')
    and split_part(a.file_url, '/', -1) not in ('.', '..'), false);
$$;
revoke all on function private.documento_cantiere_qr_valido(public.order_attachments) from public, anon, authenticated;

create or replace function private.pubblica_selezione_qr_cantiere(p_order uuid, p_documenti uuid[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.gestisci_qr_cantiere(p_order) and (select count(*) from public.order_attachments a
    where a.order_id = p_order and a.id = any(p_documenti) and private.documento_cantiere_qr_valido(a)) = cardinality(p_documenti);
$$;
revoke all on function private.pubblica_selezione_qr_cantiere(uuid, uuid[]) from public, anon;
grant execute on function private.pubblica_selezione_qr_cantiere(uuid, uuid[]) to authenticated;

drop policy if exists gestisci_qr_cantiere on public.commessa_qr_cantiere;
create policy gestisci_qr_cantiere on public.commessa_qr_cantiere for all to authenticated
  using (private.gestisci_qr_cantiere(order_id)) with check (private.pubblica_selezione_qr_cantiere(order_id, documento_ids));

create or replace function private.ritira_documento_dal_qr_cantiere()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.order_id = new.order_id and old.file_url = new.file_url
      and private.documento_cantiere_qr_valido(old) and private.documento_cantiere_qr_valido(new) then
      return null;
    end if;
  end if;

  update public.commessa_qr_cantiere q
    set documento_ids = array(select a.id from public.order_attachments a where a.order_id = old.order_id
      and a.id = any(q.documento_ids) and a.id <> old.id and private.documento_cantiere_qr_valido(a)),
      revisione = gen_random_uuid()
    where q.order_id = old.order_id and old.id = any(q.documento_ids);
  return null;
end;
$$;
revoke all on function private.ritira_documento_dal_qr_cantiere() from public, anon, authenticated;
drop trigger if exists ritira_documento_dal_qr_cantiere on public.order_attachments;
create trigger ritira_documento_dal_qr_cantiere after delete or update of cantiere_tipo, access_scope, stato_revisione, file_url, order_id on public.order_attachments
  for each row execute function private.ritira_documento_dal_qr_cantiere();

-- Soltanto l'edge function può leggere i percorsi. Ricontrolla classificazione,
-- revisione e appartenenza a ogni apertura, anche dopo la stampa del QR.
create or replace function public.leggi_qr_cantiere(p_token uuid, p_documento uuid default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('codice', o.order_code, 'documenti', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.file_name, 'tipo', a.cantiere_tipo,
      'mime', a.file_type, 'byte', a.file_size, 'percorso', a.file_url) order by a.cantiere_tipo, a.file_name, a.id)
    from public.order_attachments a
    where a.order_id = q.order_id and a.id = any(q.documento_ids)
      and (p_documento is null or a.id = p_documento)
      and private.documento_cantiere_qr_valido(a)
  ), '[]'::jsonb))
  from public.commessa_qr_cantiere q
  join public.orders o on o.id = q.order_id
  where q.token = p_token and o.deleted_at is null;
$$;
revoke all on function public.leggi_qr_cantiere(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leggi_qr_cantiere(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
