-- Firma online del preventivo cointestato (24/10/2026).
--
-- Un preventivo cointestato si firma online da tutti e due gli intestatari: una richiesta
-- per firmatario, unite da gruppo_firma_id, con lo stesso documento congelato. Il
-- preventivo diventa «accettato» solo quando firma l'ultimo del gruppo; se uno rifiuta,
-- il gruppo si chiude per tutti (lo fanno le funzioni fea-*).
--
--  1. signature_requests: gruppo, posizione del firmatario, quanti devono firmare, e il
--     momento in cui il gruppo risulta completo (lo scrive una sola chiamata).
--  2. fea_gruppo_dopo_firma(richiesta): dopo una firma dice se il gruppo è completo e se
--     tocca a questa chiamata chiuderlo; serializzata per gruppo, due firme nello stesso
--     istante non chiudono due volte.
--  3. Email e telefono del cointestatario sui preventivi (servono per il codice di firma).
set local lock_timeout = '3s';

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
alter table public.signature_requests add column if not exists gruppo_firma_id uuid;
alter table public.signature_requests add column if not exists ordine_firmatario smallint not null default 1;
alter table public.signature_requests add column if not exists firmatari_richiesti smallint not null default 1;
alter table public.signature_requests add column if not exists gruppo_completato_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'signature_requests_firmatari_validi') then
    alter table public.signature_requests add constraint signature_requests_firmatari_validi
      check (ordine_firmatario between 1 and 2 and firmatari_richiesti between 1 and 2 and ordine_firmatario <= firmatari_richiesti
             and (firmatari_richiesti = 1 or gruppo_firma_id is not null));
  end if;
end $$;

create index if not exists idx_signature_requests_gruppo on public.signature_requests (gruppo_firma_id)
  where gruppo_firma_id is not null;

grant select (gruppo_firma_id, ordine_firmatario, firmatari_richiesti, gruppo_completato_at)
  on public.signature_requests to authenticated;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fea_gruppo_dopo_firma(p_richiesta uuid)
returns table (completo boolean, chiude boolean, firmati int, richiesti int, nomi text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_gruppo uuid;
  v_richiesti int;
  v_firmati int;
  v_nomi text;
  v_chiusi int;
begin
  select r.gruppo_firma_id, r.firmatari_richiesti into v_gruppo, v_richiesti
    from public.signature_requests r where r.id = p_richiesta;
  if not found then
    raise exception 'Richiesta di firma non trovata' using errcode = 'P0002';
  end if;
  -- Richiesta da sola: completa con la sua firma, e la chiude lei.
  if v_gruppo is null or coalesce(v_richiesti, 1) <= 1 then
    return query select r.status = 'signed', r.status = 'signed', (r.status = 'signed')::int, 1, r.signer_name
      from public.signature_requests r where r.id = p_richiesta;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fea_gruppo:' || v_gruppo::text, 0));
  select count(*) filter (where r.status = 'signed'),
         string_agg(r.signer_name, ' e ' order by r.ordine_firmatario) filter (where r.status = 'signed')
    into v_firmati, v_nomi
    from public.signature_requests r where r.gruppo_firma_id = v_gruppo;

  if v_firmati < v_richiesti then
    return query select false, false, v_firmati, v_richiesti, v_nomi;
    return;
  end if;
  update public.signature_requests r set gruppo_completato_at = now()
   where r.gruppo_firma_id = v_gruppo and r.gruppo_completato_at is null;
  get diagnostics v_chiusi = row_count;
  return query select true, v_chiusi > 0, v_firmati, v_richiesti, v_nomi;
end
$$;
revoke all on function public.fea_gruppo_dopo_firma(uuid) from public, anon, authenticated;
grant execute on function public.fea_gruppo_dopo_firma(uuid) to service_role;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['rst_progetti', 'bgn_progetti', 'clm_progetti', 'ele_progetti', 'idr_progetti',
                           'pav_progetti', 'pis_progetti', 'tet_progetti', 'sr_progetti', 'fv_progetti'] loop
    execute format('alter table public.%I add column if not exists cointestatario_email text', t);
    execute format('alter table public.%I add column if not exists cointestatario_telefono text', t);
  end loop;
end $$;
