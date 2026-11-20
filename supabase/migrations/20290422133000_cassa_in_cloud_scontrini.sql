set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.cassa_in_cloud_punti_vendita (
  company_id uuid not null references public.companies(id) on delete cascade,
  punto_vendita_id text not null check (punto_vendita_id ~ '^[0-9]{1,16}$'),
  nome text not null,
  valuta text check (valuta ~ '^[A-Z]{3}$'),
  chiave_id uuid unique,
  ultimo_import timestamptz,
  import_id uuid,
  import_scade timestamptz,
  primary key (company_id, punto_vendita_id)
);

alter table public.cassa_in_cloud_punti_vendita enable row level security;
revoke all on public.cassa_in_cloud_punti_vendita from public, anon, authenticated;
grant select, insert, update, delete on public.cassa_in_cloud_punti_vendita to service_role;

create table if not exists public.cassa_in_cloud_scontrini (
  company_id uuid not null references public.companies(id) on delete cascade,
  punto_vendita_id text not null,
  esterno_id text not null,
  punto_vendita_nome text not null,
  valuta text check (valuta ~ '^[A-Z]{3}$'),
  numero text,
  numero_z text,
  data date not null,
  ora time,
  totale numeric not null,
  resto numeric,
  pagamenti jsonb not null check (jsonb_typeof(pagamenti) = 'array'),
  confermato boolean,
  con_reso boolean not null,
  con_fattura boolean not null,
  presente_in_cassa boolean not null default true,
  primary key (company_id, punto_vendita_id, esterno_id)
);

create index if not exists cassa_in_cloud_scontrini_per_data
  on public.cassa_in_cloud_scontrini (company_id, data desc, ora desc, punto_vendita_id, esterno_id);
create index if not exists cassa_in_cloud_scontrini_per_punto_data
  on public.cassa_in_cloud_scontrini (company_id, punto_vendita_id, data);

alter table public.cassa_in_cloud_scontrini enable row level security;
revoke all on public.cassa_in_cloud_scontrini from public, anon, authenticated;
grant select on public.cassa_in_cloud_scontrini to authenticated;
grant select, insert, update, delete on public.cassa_in_cloud_scontrini to service_role;

drop policy if exists cassa_in_cloud_scontrini_leggi on public.cassa_in_cloud_scontrini;
create policy cassa_in_cloud_scontrini_leggi on public.cassa_in_cloud_scontrini for select to authenticated
using (
  not (select public.utente_bloccato())
  and public.has_permission_for_company((select auth.uid()), 'can_view_billing', company_id)
);

-- La chiave vive nel Vault. La sostituzione invalida un eventuale import in corso.
create or replace function public.cassa_in_cloud_collega(
  p_company_id uuid, p_punto_vendita_id text, p_nome text, p_valuta text, p_chiave text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_chiave_id uuid;
begin
  insert into public.cassa_in_cloud_punti_vendita (company_id, punto_vendita_id, nome, valuta)
  values (p_company_id, p_punto_vendita_id, p_nome, p_valuta)
  on conflict (company_id, punto_vendita_id) do update
    set nome = excluded.nome, valuta = excluded.valuta, import_id = null, import_scade = null
  returning chiave_id into v_chiave_id;

  if exists (select 1 from vault.secrets where id = v_chiave_id) then
    perform vault.update_secret(v_chiave_id, p_chiave);
  else
    v_chiave_id := vault.create_secret(p_chiave, null, 'Chiave API Cassa in Cloud');
    update public.cassa_in_cloud_punti_vendita set chiave_id = v_chiave_id
     where company_id = p_company_id and punto_vendita_id = p_punto_vendita_id;
  end if;
end;
$$;

create or replace function public.cassa_in_cloud_rimuovi_chiave()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.chiave_id;
  return old;
end;
$$;

drop trigger if exists cassa_in_cloud_rimuovi_chiave on public.cassa_in_cloud_punti_vendita;
create trigger cassa_in_cloud_rimuovi_chiave after delete on public.cassa_in_cloud_punti_vendita
for each row execute function public.cassa_in_cloud_rimuovi_chiave();

create or replace function public.cassa_in_cloud_inizia_import(p_company_id uuid, p_punto_vendita_id text)
returns table (import_id uuid, chiave text)
language plpgsql security definer set search_path = '' as $$
declare
  v_import_id uuid;
  v_chiave_id uuid;
begin
  update public.cassa_in_cloud_punti_vendita c
     set import_id = gen_random_uuid(), import_scade = now() + interval '90 seconds'
   where c.company_id = p_company_id and c.punto_vendita_id = p_punto_vendita_id
     and (c.import_id is null or c.import_scade <= now())
  returning c.import_id, c.chiave_id into v_import_id, v_chiave_id;
  if found then
    return query select v_import_id, (
      select s.decrypted_secret from vault.decrypted_secrets s where s.id = v_chiave_id
    );
  end if;
end;
$$;

create or replace function public.cassa_in_cloud_salva_import(
  p_company_id uuid, p_punto_vendita_id text, p_import_id uuid, p_dal date, p_al date, p_righe jsonb
) returns table (importati integer, assenti integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_punto public.cassa_in_cloud_punti_vendita%rowtype;
begin
  select * into v_punto from public.cassa_in_cloud_punti_vendita
   where company_id = p_company_id and punto_vendita_id = p_punto_vendita_id
     and import_id = p_import_id and import_scade > now()
   for update;
  if not found then return; end if;

  if p_dal is null or p_al is null or p_al - p_dal not between 0 and 1
    or jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) > 5000
    or exists (
      select 1 from jsonb_to_recordset(p_righe) as r(data date)
       where r.data is null or r.data not between p_dal and p_al
    ) then
    raise exception 'Intervallo o righe di importazione non validi';
  end if;

  -- Uno scontrino sparito dalla risposta del fornitore resta consultabile.
  update public.cassa_in_cloud_scontrini s set presente_in_cassa = false
   where s.company_id = p_company_id and s.punto_vendita_id = p_punto_vendita_id
     and s.data between p_dal and p_al and s.presente_in_cassa
     and not exists (select 1 from jsonb_to_recordset(p_righe) as r(esterno_id text) where r.esterno_id = s.esterno_id);
  get diagnostics assenti = row_count;

  insert into public.cassa_in_cloud_scontrini (
    company_id, punto_vendita_id, esterno_id, punto_vendita_nome, valuta,
    numero, numero_z, data, ora, totale, resto, pagamenti, confermato, con_reso, con_fattura
  )
  select p_company_id, p_punto_vendita_id, r.esterno_id, v_punto.nome, v_punto.valuta,
         r.numero, r.numero_z, r.data, r.ora, r.totale, r.resto, r.pagamenti, r.confermato, r.con_reso, r.con_fattura
    from jsonb_to_recordset(p_righe) as r(
      esterno_id text, numero text, numero_z text, data date, ora time, totale numeric, resto numeric,
      pagamenti jsonb, confermato boolean, con_reso boolean, con_fattura boolean
    )
  on conflict (company_id, punto_vendita_id, esterno_id) do update
    set punto_vendita_nome = excluded.punto_vendita_nome, valuta = excluded.valuta,
        numero = excluded.numero, numero_z = excluded.numero_z, data = excluded.data, ora = excluded.ora,
        totale = excluded.totale, resto = excluded.resto, pagamenti = excluded.pagamenti,
        confermato = excluded.confermato, con_reso = excluded.con_reso, con_fattura = excluded.con_fattura,
        presente_in_cassa = true;
  get diagnostics importati = row_count;

  update public.cassa_in_cloud_punti_vendita
     set ultimo_import = now(), import_id = null, import_scade = null
   where company_id = p_company_id and punto_vendita_id = p_punto_vendita_id;
  return next;
end;
$$;

revoke all on function public.cassa_in_cloud_collega(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cassa_in_cloud_rimuovi_chiave() from public, anon, authenticated;
revoke all on function public.cassa_in_cloud_inizia_import(uuid, text) from public, anon, authenticated;
revoke all on function public.cassa_in_cloud_salva_import(uuid, text, uuid, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.cassa_in_cloud_collega(uuid, text, text, text, text) to service_role;
grant execute on function public.cassa_in_cloud_inizia_import(uuid, text) to service_role;
grant execute on function public.cassa_in_cloud_salva_import(uuid, text, uuid, date, date, jsonb) to service_role;
