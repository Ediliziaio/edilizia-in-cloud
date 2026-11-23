-- 23/11/2026 — Le voci della fattura che il listino scrive diverso, abbinate una volta e ricordate.
-- «CUBIERE PVC» in fattura è «Fornitura di cubetti in PVC» a listino: nessuna regola lo capisce da
-- sola. Chi controlla la fattura le abbina; da lì valgono per tutte le fatture di quel fornitore
-- (shared/acquisti/prezziListino.ts, prima del codice e della descrizione).
-- Tabella chiusa: niente regole RLS (una CREATE POLICY qui blocca auth fino al commit), si legge e si
-- scrive solo con le funzioni sotto, che controllano azienda e permessi.
create table if not exists public.listino_fornitore_equivalenze (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  voce_id uuid not null references public.listino_fornitore_voci(id) on delete cascade,
  chiave text not null,
  fattura_codice text,
  fattura_descrizione text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, supplier_id, chiave)
);
alter table public.listino_fornitore_equivalenze enable row level security;
revoke all on table public.listino_fornitore_equivalenze from anon, authenticated;
grant all on table public.listino_fornitore_equivalenze to service_role;
create index if not exists listino_fornitore_equivalenze_voce on public.listino_fornitore_equivalenze (voce_id);

-- La chiave di una voce di fattura: il codice, se c'è; altrimenti la descrizione. Solo lettere e cifre.
-- Gemella di chiaveEquivalenza in shared/acquisti/prezziListino.ts.
create or replace function public.listino_equivalenza_chiave(p_codice text, p_descrizione text)
returns text language sql immutable set search_path = '' as $$
  select case
    when nullif(upper(regexp_replace(coalesce(p_codice, ''), '[^A-Za-z0-9]', '', 'g')), '') is not null
      then 'C:' || upper(regexp_replace(p_codice, '[^A-Za-z0-9]', '', 'g'))
    when length(regexp_replace(coalesce(p_descrizione, ''), '[^A-Za-z0-9]', '', 'g')) >= 3
      then 'D:' || upper(regexp_replace(p_descrizione, '[^A-Za-z0-9]', '', 'g'))
  end
$$;
grant execute on function public.listino_equivalenza_chiave(text, text) to authenticated, service_role;

create or replace function public.listino_equivalenze_fornitore(p_supplier uuid)
returns table(id uuid, chiave text, voce_id uuid, fattura_codice text, fattura_descrizione text)
language plpgsql stable security definer set search_path = '' as $$
declare azienda uuid;
begin
  select s.company_id into azienda from public.suppliers s where s.id = p_supplier;
  if azienda is null or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not coalesce(public.user_can_access_company(azienda), false)
     or not coalesce(public.puo_vedere_costi(azienda) or public.e_super_admin_dentro(azienda), false) then
    raise exception 'Non puoi vedere i prezzi di questo fornitore' using errcode = '42501';
  end if;
  return query select e.id, e.chiave, e.voce_id, e.fattura_codice, e.fattura_descrizione
    from public.listino_fornitore_equivalenze e where e.company_id = azienda and e.supplier_id = p_supplier;
end $$;
revoke all on function public.listino_equivalenze_fornitore(uuid) from public, anon;
grant execute on function public.listino_equivalenze_fornitore(uuid) to authenticated, service_role;

create or replace function public.listino_equivalenza_salva(p_supplier uuid, p_voce uuid, p_codice text, p_descrizione text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare azienda uuid; k text; nuovo uuid;
begin
  select s.company_id into azienda from public.suppliers s where s.id = p_supplier;
  if azienda is null or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not coalesce(public.user_can_access_company(azienda), false) or not public.puo_registrare_costi(azienda) then
    raise exception 'Non puoi modificare i prezzi di questo fornitore' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listino_fornitore_voci v join public.listini_fornitore l on l.id = v.listino_id
                  where v.id = p_voce and l.supplier_id = p_supplier and l.company_id = azienda) then
    raise exception 'La voce non è nel listino di questo fornitore' using errcode = '22023';
  end if;
  k := public.listino_equivalenza_chiave(p_codice, p_descrizione);
  if k is null then raise exception 'La voce della fattura non ha né codice né descrizione' using errcode = '22023'; end if;
  insert into public.listino_fornitore_equivalenze (company_id, supplier_id, voce_id, chiave, fattura_codice, fattura_descrizione, created_by)
  values (azienda, p_supplier, p_voce, k, nullif(btrim(p_codice), ''), left(btrim(coalesce(p_descrizione, '')), 500), auth.uid())
  on conflict (company_id, supplier_id, chiave) do update
    set voce_id = excluded.voce_id, fattura_codice = excluded.fattura_codice, fattura_descrizione = excluded.fattura_descrizione,
        created_by = excluded.created_by, created_at = now()
  returning id into nuovo;
  return nuovo;
end $$;
revoke all on function public.listino_equivalenza_salva(uuid, uuid, text, text) from public, anon;
grant execute on function public.listino_equivalenza_salva(uuid, uuid, text, text) to authenticated, service_role;

create or replace function public.listino_equivalenza_togli(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare azienda uuid;
begin
  select e.company_id into azienda from public.listino_fornitore_equivalenze e where e.id = p_id;
  if azienda is null or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not coalesce(public.user_can_access_company(azienda), false) or not public.puo_registrare_costi(azienda) then
    raise exception 'Non puoi modificare i prezzi di questo fornitore' using errcode = '42501';
  end if;
  delete from public.listino_fornitore_equivalenze where id = p_id;
end $$;
revoke all on function public.listino_equivalenza_togli(uuid) from public, anon;
grant execute on function public.listino_equivalenza_togli(uuid) to authenticated, service_role;
