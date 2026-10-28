-- Solo archivio documentale: nessun SAL viene approvato o segnato pagato.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create table if not exists public.sal_sub_verbali (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 sal_id uuid not null references public.sal_subappaltatori(id),
 contratto_id uuid not null references public.contratti_subappalto(id),
 order_id uuid not null references public.orders(id),
 subappaltatore_id uuid not null references public.subappaltatori_sicurezza(id),
 richiesta_id uuid not null,
 richiesta_sha256 text not null check(richiesta_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot jsonb not null,
 pdf_path text not null,
 pdf_sha256 text not null check(pdf_sha256 ~ '^[a-f0-9]{64}$'),
 pacchetto_path text,
 pacchetto_sha256 text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(company_id, richiesta_id)
);
create index if not exists sal_sub_verbali_elenco on public.sal_sub_verbali(company_id,sal_id,created_at desc);
alter table public.sal_sub_verbali enable row level security;
revoke all on public.sal_sub_verbali from anon, authenticated;
grant select on public.sal_sub_verbali to authenticated;
grant all on public.sal_sub_verbali to service_role;
drop policy if exists sal_sub_verbali_lettura on public.sal_sub_verbali;
create policy sal_sub_verbali_lettura on public.sal_sub_verbali for select to authenticated using (
 not public.utente_bloccato()
 and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id)
 and public.has_permission_for_company(auth.uid(),'can_view_costs',company_id)
);
-- Gli originali non hanno policy client: apertura soltanto tramite Edge autenticata.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('verbali-sal-sub','verbali-sal-sub',false,31457280,array['application/pdf','application/zip'])
 on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

-- Anche eventuali policy Storage generiche non concedono accesso al nuovo bucket.
drop policy if exists verbali_sal_sub_solo_edge on storage.objects;
create policy verbali_sal_sub_solo_edge on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id <> 'verbali-sal-sub') with check(bucket_id <> 'verbali-sal-sub');

-- Catena aziendale verificata anche per le scritture SAL esistenti.
create or replace function public.sal_sub_commessa_dal_contratto()
returns trigger language plpgsql security definer set search_path=public as $$
declare c record;
begin
 select cs.order_id,cs.subappaltatore_id into c from public.contratti_subappalto cs
 join public.orders o on o.id=cs.order_id and o.company_id=cs.company_id
 join public.subappaltatori_sicurezza ss on ss.id=cs.subappaltatore_id and ss.company_id=cs.company_id
 where cs.id=new.contratto_id and cs.company_id=new.company_id;
 if not found then raise exception 'Contratto non disponibile per questa azienda' using errcode='23514'; end if;
 new.order_id:=c.order_id;
 new.subappaltatore_id:=c.subappaltatore_id;
 return new;
end;
$$;

revoke all on function public.sal_sub_commessa_dal_contratto() from public,anon,authenticated;
drop trigger if exists trg_sal_sub_commessa_dal_contratto on public.sal_subappaltatori;
create trigger trg_sal_sub_commessa_dal_contratto before insert or update of contratto_id,company_id,order_id,subappaltatore_id
 on public.sal_subappaltatori for each row execute function public.sal_sub_commessa_dal_contratto();
commit;
