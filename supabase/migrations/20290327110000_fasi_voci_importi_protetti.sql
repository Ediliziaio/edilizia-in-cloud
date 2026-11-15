-- Fasi e voci della commessa: gli importi si leggono solo col permesso, anche
-- chiamando l'API direttamente.
--
-- Prima: lo schermo nascondeva l'importo venduto delle fasi e importi/costi
-- delle voci a chi non ha «Venduto e importi» (o «Costi»), il database ne
-- rifiutava la scrittura (trigger aaa_office_direct_write), ma una GET su
-- /rest/v1/order_work_phases restituiva tutto.
--
-- Schema scelto (lo stesso dei rapportini, vedi CLAUDE.md «I soldi dei
-- rapportini»), NON una regola restrittiva sulle righe:
--   * sulle tabelle grezze `authenticated` ha il GRANT di SELECT per colonna,
--     tutto tranne le colonne protette. Le righe visibili restano quelle di
--     sempre: nessuna regola nuova, quindi nessuna regola di altre tabelle che
--     legge le fasi si svuota (il 12/11 una restrittiva su `orders` ne ha
--     svuotate 61). Scritture invariate: INSERT/UPDATE restano concessi, i
--     controlli sugli importi li fanno i trigger di sempre.
--   * le viste `order_work_phases_visibili` e `order_work_phase_voci_visibili`
--     sono security_invoker (stesse regole di riga della tabella, niente copia
--     dei predicati che invecchia) e danno le colonne protette attraverso una
--     funzione definer che le restituisce solo a chi ha il diritto.
--   * il browser legge dalle viste senza cambiare le chiamate: il client
--     riscrive le GET (lib/orders/protectedPhaseRequests.ts), come fa per le
--     banche. Le scritture vanno alle tabelle.
--
-- In due migrazioni: questa (viste, funzioni, lettori sistemati) non toglie
-- niente a nessuno; i permessi per colonna stanno in 20290327110100, da
-- applicare solo quando il frontend che legge dalle viste è online — prima, il
-- `select("*")` delle pagine vecchie fallirebbe per tutti.
--
-- Conseguenza da ricordare: `select *` (anche dentro un embed o un RETURNING)
-- sulle tabelle grezze fallisce per tutti gli utenti, amministratori compresi.
-- Una colonna NUOVA su queste tabelle non è leggibile dal browser finché non
-- la si aggiunge al GRANT (rilanciare il blocco «permessi per colonna») e alla
-- vista (rilanciare il blocco «viste»).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Diritti economici di chi legge, per azienda. La riga è già visibile per le
--    regole della tabella (la vista è invoker): qui serve solo sapere se può
--    vedere i soldi. Stessa regola di private.office_order_rights.
--    Calcolarli costa ~5 ms (una decina di has_permission_for_company): riga
--    per riga, 1.388 fasi erano 7-12 secondi. Si calcolano una volta per
--    transazione (= una richiesta PostgREST) e si tengono in una variabile
--    locale, con chiave utente+ruolo+azienda. Chi potesse scrivere variabili di
--    sessione potrebbe già scrivere request.jwt.claims: nessuna superficie nuova.
create or replace function private.diritti_economici_azienda(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
declare
 chiave text := 'eic_diritti.a' || md5(coalesce(auth.role(), '') || ':' || coalesce(auth.uid()::text, '') || ':' || coalesce(p_company::text, ''));
 salvato text := current_setting(chiave, true);
 diritti jsonb;
begin
 if salvato is not null and salvato <> '' then return salvato::jsonb; end if;
 diritti := case when coalesce(auth.role(), '') <> 'service_role' and public.utente_e_cliente_esterno()
   then jsonb_build_object('amounts', true, 'payments', true, 'costs', false, 'margins', false, 'personal', false)
   else coalesce(private.office_company_rights(p_company), '{}'::jsonb) end;
 perform set_config(chiave, diritti::text, true);
 return diritti;
end $f$;

create or replace function private.fase_importo_venduto(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select f.importo_venduto from public.order_work_phases f
  where f.id = p_id and coalesce((private.diritti_economici_azienda(f.company_id) ->> 'amounts')::boolean, false)
$f$;

create or replace function private.voce_importo(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select v.importo from public.order_work_phase_voci v
  where v.id = p_id and coalesce((private.diritti_economici_azienda(v.company_id) ->> 'amounts')::boolean, false)
$f$;

create or replace function private.voce_costo_manodopera(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select v.costo_manodopera from public.order_work_phase_voci v
  where v.id = p_id and coalesce((private.diritti_economici_azienda(v.company_id) ->> 'costs')::boolean, false)
$f$;

create or replace function private.voce_costo_materiali(p_id uuid)
returns numeric language sql stable security definer set search_path = ''
as $f$
 select v.costo_materiali from public.order_work_phase_voci v
  where v.id = p_id and coalesce((private.diritti_economici_azienda(v.company_id) ->> 'costs')::boolean, false)
$f$;

revoke all on function private.diritti_economici_azienda(uuid), private.fase_importo_venduto(uuid),
  private.voce_importo(uuid), private.voce_costo_manodopera(uuid), private.voce_costo_materiali(uuid) from public, anon;
grant execute on function private.diritti_economici_azienda(uuid), private.fase_importo_venduto(uuid),
  private.voce_importo(uuid), private.voce_costo_manodopera(uuid), private.voce_costo_materiali(uuid) to authenticated, service_role;

-- 2. Viste: stesse colonne, stesso ordine della tabella; le protette passano
--    dalla funzione (calcolata solo se la colonna è chiesta).
do $viste$
declare t record; cols text;
begin
 for t in select * from (values
   ('order_work_phases', 'f', '{"importo_venduto":"private.fase_importo_venduto"}'::jsonb),
   ('order_work_phase_voci', 'v', '{"importo":"private.voce_importo","costo_manodopera":"private.voce_costo_manodopera","costo_materiali":"private.voce_costo_materiali"}'::jsonb)
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
    'Lettura del browser: stesse righe della tabella (security_invoker), importi solo a chi ha il permesso. Migrazione 20290327110000.');
 end loop;
end $viste$;

-- 3. Chi legge le colonne protette dalla tabella grezza da utente: la vista del
--    controllo di gestione (invoker) e due funzioni con `select *`.
do $lettori$
declare def text; nuova text;
begin
 -- Lavori in corso: somma gli importi delle fasi → dalla vista (stesso valore a
 -- chi ha il permesso; la vista legge comunque `orders`, che chi non ha
 -- importi+costi+margini non vede).
 def := coalesce(pg_get_viewdef(to_regclass('public.v_cg_lavori_in_corso')), 'order_work_phases_visibili');
 nuova := regexp_replace(def, '((public\.)?order_work_phases)(\s+f\M)', 'public.order_work_phases_visibili\3', 'g');
 if nuova <> def then
  execute 'create or replace view public.v_cg_lavori_in_corso with (security_invoker = true) as ' || nuova;
 elsif def !~ 'order_work_phases_visibili' then
  raise exception 'v_cg_lavori_in_corso: lettura delle fasi non trovata, controllare a mano';
 end if;

 -- sottofase_da_voce: `select *` sulla voce → solo le colonne che usa.
 def := coalesce(pg_get_functiondef(to_regprocedure('public.sottofase_da_voce(uuid)')), '');
 nuova := replace(def,
   'select * into v from public.order_work_phase_voci where id = p_voce_id for update;',
   'select x.subphase_id, x.descrizione, x.phase_id into v.subphase_id, v.descrizione, v.phase_id from public.order_work_phase_voci x where x.id = p_voce_id for update;');
 if nuova <> def then execute nuova;
 elsif def ~ 'select \* into v from public.order_work_phase_voci' then raise exception 'sottofase_da_voce: testo cambiato, controllare a mano';
 end if;

 -- Fotografia addetti: to_jsonb(x) legge tutta la riga della fase. La colonna
 -- «description» sulle fasi non esiste: il valore era sempre null.
 def := coalesce(pg_get_functiondef(to_regprocedure('public.sicurezza_addetti_fotografia_autore(uuid,uuid,date,date,uuid,uuid)')), '');
 nuova := replace(def, '''descrizione'',to_jsonb(x)->''description''', '''descrizione'',null::jsonb');
 if nuova <> def then execute nuova;
 elsif def ~ 'to_jsonb\(x\)->''description''' then raise exception 'sicurezza_addetti_fotografia_autore: testo cambiato, controllare a mano';
 end if;
end $lettori$;
