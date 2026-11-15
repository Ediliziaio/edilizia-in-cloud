-- Gli importi dei SAL solo a chi ha «Venduto e importi» (15/11/2026, decisione del titolare).
--
-- Un utente d'ufficio senza quel diritto non vedeva il venduto di fasi e voci, né il totale della
-- commessa, ma nei SAL leggeva tutto: le voci del verbale sono proprio il venduto di ogni fase.
-- Da qui:
--  - il browser legge verbali, voci e sottofasi dalle viste `*_visibili` (security_invoker: stesse
--    righe della tabella), dove gli importi arrivano solo a chi ha il diritto. Come per le fasi
--    (20290327110000): sulle tabelle grezze le colonne degli importi si chiudono con la migrazione
--    dopo (20290402130100), quando il frontend legge già dalle viste;
--  - il certificato di pagamento, che è fatto solo di importi, lo legge solo chi ha il diritto;
--  - creare, cambiare o cancellare un SAL (verbale, voci, sottofasi, certificato) chiede, oltre a
--    poter modificare la commessa, il diritto agli importi. Le funzioni del database (SAL della
--    generale, firma col link) sono SECURITY DEFINER e non passano da queste regole.
--
-- Nessuna regola di altre tabelle legge queste tabelle; nessuna vista; l'unica funzione non definer
-- che le legge (private.office_quadro_pagamenti_raw) è chiamata solo da una definer.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Il diritto, una regola sola ────────────────────────────────────────────
create or replace function private.sal_importi_visibili(p_company uuid)
returns boolean language sql stable security definer set search_path = ''
as $f$
 select coalesce((private.diritti_economici_azienda(p_company) ->> 'amounts')::boolean, false)
$f$;

create or replace function private.sal_importo_totale(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select s.importo_totale from public.sal_records s
  where s.id = p_id and private.sal_importi_visibili(s.company_id)
$f$;

create or replace function private.sal_voce_importo_contrattuale(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select v.importo_contrattuale from public.sal_voci v join public.sal_records s on s.id = v.sal_id
  where v.id = p_id and private.sal_importi_visibili(s.company_id)
$f$;

create or replace function private.sal_voce_importo_sal(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select v.importo_sal from public.sal_voci v join public.sal_records s on s.id = v.sal_id
  where v.id = p_id and private.sal_importi_visibili(s.company_id)
$f$;

create or replace function private.sal_sottofase_importo_contrattuale(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select d.importo_contrattuale from public.sal_voci_sottofasi d
   join public.sal_voci v on v.id = d.voce_id join public.sal_records s on s.id = v.sal_id
  where d.id = p_id and private.sal_importi_visibili(s.company_id)
$f$;

create or replace function private.sal_sottofase_importo_sal(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select d.importo_sal from public.sal_voci_sottofasi d
   join public.sal_voci v on v.id = d.voce_id join public.sal_records s on s.id = v.sal_id
  where d.id = p_id and private.sal_importi_visibili(s.company_id)
$f$;

-- La regola di scrittura: chi modifica la commessa E vede gli importi.
create or replace function private.puo_scrivere_sal(p_order_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $f$
 select public.puo_modificare_commessa(p_order_id)
    and private.sal_importi_visibili(public.get_order_company_id(p_order_id))
$f$;

revoke all on function private.sal_importi_visibili(uuid), private.sal_importo_totale(uuid),
  private.sal_voce_importo_contrattuale(uuid), private.sal_voce_importo_sal(uuid),
  private.sal_sottofase_importo_contrattuale(uuid), private.sal_sottofase_importo_sal(uuid),
  private.puo_scrivere_sal(uuid) from public, anon;
grant execute on function private.sal_importi_visibili(uuid), private.sal_importo_totale(uuid),
  private.sal_voce_importo_contrattuale(uuid), private.sal_voce_importo_sal(uuid),
  private.sal_sottofase_importo_contrattuale(uuid), private.sal_sottofase_importo_sal(uuid),
  private.puo_scrivere_sal(uuid) to authenticated, service_role;

-- ── 2. Le viste del browser ───────────────────────────────────────────────────
do $viste$
declare t record; cols text;
begin
 for t in select * from (values
   ('sal_records', 's', '{"importo_totale":"private.sal_importo_totale"}'::jsonb),
   ('sal_voci', 'v', '{"importo_contrattuale":"private.sal_voce_importo_contrattuale","importo_sal":"private.sal_voce_importo_sal"}'::jsonb),
   ('sal_voci_sottofasi', 'd', '{"importo_contrattuale":"private.sal_sottofase_importo_contrattuale","importo_sal":"private.sal_sottofase_importo_sal"}'::jsonb)
 ) x(tabella, alias, protette) loop
  select string_agg(case when t.protette ? a.attname
      then format('%s(%I.id) as %I', t.protette ->> a.attname, t.alias, a.attname)
      else format('%I.%I', t.alias, a.attname) end, ', ' order by a.attnum)
    into cols
    from pg_attribute a
   where a.attrelid = format('public.%I', t.tabella)::regclass and a.attnum > 0 and not a.attisdropped;
  execute format('create or replace view public.%I with (security_invoker = true) as select %s from public.%I %I',
    t.tabella || '_visibili', cols, t.tabella, t.alias);
  execute format('revoke all on public.%I from public, anon', t.tabella || '_visibili');
  execute format('grant select on public.%I to authenticated, service_role', t.tabella || '_visibili');
  execute format('comment on view public.%I is %L', t.tabella || '_visibili',
    'Lettura del browser: stesse righe della tabella (security_invoker), importi solo a chi ha «Venduto e importi». Migrazione 20290402130000.');
 end loop;
end $viste$;

-- ── 3. Le regole ──────────────────────────────────────────────────────────────
-- Certificato di pagamento: solo importi, quindi lo legge solo chi ha il diritto.
drop policy if exists sal_certificati_lettura_azienda on public.sal_certificati;
create policy sal_certificati_lettura_azienda on public.sal_certificati for select to authenticated
using (
  company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid())
                 union
                 select m.company_id from public.multi_company_access m
                  where m.user_id = (select auth.uid()) and m.status = 'active'
                    and (m.expires_at is null or m.expires_at > now()))
  and private.sal_importi_visibili(company_id)
);

drop policy if exists sal_certificati_insert_con_permesso on public.sal_certificati;
create policy sal_certificati_insert_con_permesso on public.sal_certificati for insert to authenticated
with check (exists (select 1 from public.sal_records s where s.id = sal_certificati.sal_id and private.puo_scrivere_sal(s.order_id)));
drop policy if exists sal_certificati_update_con_permesso on public.sal_certificati;
create policy sal_certificati_update_con_permesso on public.sal_certificati for update to authenticated
using (private.puo_scrivere_sal(order_id))
with check (exists (select 1 from public.sal_records s where s.id = sal_certificati.sal_id and private.puo_scrivere_sal(s.order_id)));
drop policy if exists sal_certificati_delete_con_permesso on public.sal_certificati;
create policy sal_certificati_delete_con_permesso on public.sal_certificati for delete to authenticated
using (private.puo_scrivere_sal(order_id));

drop policy if exists sal_records_insert_con_permesso on public.sal_records;
create policy sal_records_insert_con_permesso on public.sal_records for insert to authenticated
with check (company_id = public.get_order_company_id(order_id) and private.puo_scrivere_sal(order_id));
drop policy if exists sal_records_update_con_permesso on public.sal_records;
create policy sal_records_update_con_permesso on public.sal_records for update to authenticated
using (private.puo_scrivere_sal(order_id))
with check (company_id = public.get_order_company_id(order_id) and private.puo_scrivere_sal(order_id));
drop policy if exists sal_records_delete_con_permesso on public.sal_records;
create policy sal_records_delete_con_permesso on public.sal_records for delete to authenticated
using (private.puo_scrivere_sal(order_id));

drop policy if exists sal_voci_insert_con_permesso on public.sal_voci;
create policy sal_voci_insert_con_permesso on public.sal_voci for insert to authenticated
with check (exists (select 1 from public.sal_records s where s.id = sal_voci.sal_id and private.puo_scrivere_sal(s.order_id)));
drop policy if exists sal_voci_update_con_permesso on public.sal_voci;
create policy sal_voci_update_con_permesso on public.sal_voci for update to authenticated
using (exists (select 1 from public.sal_records s where s.id = sal_voci.sal_id and private.puo_scrivere_sal(s.order_id)))
with check (exists (select 1 from public.sal_records s where s.id = sal_voci.sal_id and private.puo_scrivere_sal(s.order_id)));
drop policy if exists sal_voci_delete_con_permesso on public.sal_voci;
create policy sal_voci_delete_con_permesso on public.sal_voci for delete to authenticated
using (exists (select 1 from public.sal_records s where s.id = sal_voci.sal_id and private.puo_scrivere_sal(s.order_id)));

drop policy if exists sal_voci_sottofasi_scrittura on public.sal_voci_sottofasi;
create policy sal_voci_sottofasi_scrittura on public.sal_voci_sottofasi for all to authenticated
using (exists (select 1 from public.sal_voci v join public.sal_records s on s.id = v.sal_id
                where v.id = sal_voci_sottofasi.voce_id and private.puo_scrivere_sal(s.order_id)))
with check (exists (select 1 from public.sal_voci v join public.sal_records s on s.id = v.sal_id
                     where v.id = sal_voci_sottofasi.voce_id and private.puo_scrivere_sal(s.order_id)));
