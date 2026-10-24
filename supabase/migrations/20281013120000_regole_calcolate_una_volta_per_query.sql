-- Regole di accesso più leggere su sei tabelle (13/10/2026): i controlli che
-- dipendono solo da chi legge si calcolano una volta per query.
--
-- Molte regole RLS chiamano funzioni come has_role(auth.uid(), 'super_admin'),
-- has_permission(auth.uid(), 'can_view_orders'), get_user_company_id(auth.uid()),
-- get_my_company_id(), utente_e_cliente_esterno() o get_auth_email(): il loro
-- valore dipende da chi legge, non dalla riga letta. Sono funzioni SECURITY
-- DEFINER con un search_path fisso, che il pianificatore non espande: scritte
-- direttamente nella regola si eseguono per ogni riga esaminata. Dentro una
-- sottoquery, «( SELECT has_role(…) )», diventano un InitPlan: una chiamata per
-- query, con lo stesso valore (sono STABLE: nella stessa istruzione rispondono
-- sempre allo stesso modo).
--
-- Cambia solo questo: ogni chiamata con argomenti che non dipendono dalla riga
-- passa dentro una sottoquery. Le funzioni che leggono una colonna della riga
-- (user_can_read_accountant_company(company_id), check_staff_visibility(…,
-- assigned_to), cliente_contatto_ha_mia_email(contact_id)) restano dove sono.
-- ALTER POLICY tocca solo USING e WITH CHECK: nome, comando, ruoli e tipo di
-- ogni regola restano quelli di prima.
--
-- Tempi misurati in produzione su copie temporanee delle tabelle con le regole
-- nuove, in transazioni annullate, come utenti veri di Demo Azienda 2
-- (pianificazione + esecuzione, il migliore di tre giri, funzioni di supporto
-- ancora in SQL):
--
--   prima_nota_entries   ultime 50 registrazioni, senza permesso   3.664 ms -> 34 ms
--                        ultime 50 registrazioni, con permesso       122 ms -> 6 ms
--                        registrazioni dell'anno (486)             1.148 ms -> 14 ms
--   employees            i 69 dipendenti dell'azienda             92-114 ms -> 2-4 ms
--   appointments         tutti i 1.285 appuntamenti                 280 ms -> 234 ms
--   order_external_teams squadre di 20 commesse (dipendente)        112 ms -> 90 ms
--   order_statuses       i 10 stati commessa (staff)                 56 ms -> 46 ms
--   staff_permissions    i permessi dell'azienda                     15 ms -> 13 ms
--
-- La 20281012200000 (funzioni di supporto in plpgsql), applicata dopo queste
-- misure, fa costare meno ogni chiamata: il guadagno per riga si riduce, ma
-- resta una chiamata invece di una per riga.
--
-- appointments_lettura_authenticated è censita il 23/10/2026, dopo che ha preso
-- la clausola dei sopralluoghi: cambia solo get_auth_email() nella sottoquery
-- sui contatti, come verificato il 13/10.
--
-- Verificato prima di scrivere questo file, sempre su copie temporanee in
-- transazioni annullate, per 180 identità (i 159 utenti attivi, 20 utenti
-- bloccati e l'anonimo): stesse righe visibili, stesse righe modificabili e
-- cancellabili, e per ogni regola cambiata la stessa condizione USING / WITH
-- CHECK riga per riga (3.780 confronti), 0 differenze. Tabelle intere per
-- employees, order_statuses, order_external_teams e staff_permissions; per
-- prima_nota_entries e appointments un campione per azienda (32 e 166 righe).
-- Ogni testo nuovo, applicato a una copia, pg_get_expr lo riscrive identico.
--
-- Rilanciabile: ogni regola deve avere il testo censito il 13/10/2026 oppure
-- già quello nuovo (impronta md5 di «USING|WITH CHECK»); se nel frattempo è
-- cambiata, la migrazione si ferma senza toccare niente. In fondo un controllo
-- rilegge le regole e annulla tutto se il testo non è quello verificato.
--
-- ALTER POLICY prende un lock esclusivo sulla tabella fino alla fine della
-- migrazione. Su questo progetto supautils (supautils.policy_grants), a ogni
-- CREATE/ALTER POLICY, prende un lock esclusivo anche sulle tabelle di auth,
-- storage e realtime che elenca: accessi, rinnovo dei token, file e realtime
-- aspettano fino al COMMIT. Le istruzioni sono istantanee e lock_timeout è di
-- 3 secondi (se scade, si rilancia più tardi); da applicare in un'ora
-- tranquilla, fuori dalla fascia 07:00-09:30 UTC dei giorni feriali. Le sei
-- tabelle si bloccano tutte insieme prima del primo ALTER, nello stesso ordine.
--
-- Le tabelle della commessa (orders, order_work_phases, order_work_subphases,
-- order_campo_assignments, campo_rapportini) le alleggerisce la migrazione
-- 20281012200200.

set local lock_timeout = '3s';
-- Il testo delle regole (pg_get_expr) dipende dal search_path: lo stesso del
-- censimento, così le impronte si confrontano alla pari.
set local search_path = "$user", public, extensions;

do $$
declare
  -- Per ogni regola: [impronta censita, impronta nuova] di «USING|WITH CHECK»
  -- come lo scrive pg_get_expr.
  v_regole constant jsonb := jsonb_build_object(
    'prima_nota_entries|prima_nota_entries_lettura_authenticated', jsonb_build_array('f4061f5fe74ebb74db12993caebe34b8', '3dc50c6f0ac1f654f166fc503014e8f8'),
    'prima_nota_entries|prima_nota_super_admin', jsonb_build_array('cc12fea6ed9ad3a5e9ff8a0d7f1bd972', '56058d1d003c351b196b6cd19676da7d'),
    'prima_nota_entries|prima_nota_tenant_delete', jsonb_build_array('035826ab85b0f42ccb7c8e1229c44da0', '1f2ae0bf47b9ffdd3c9891885e699e97'),
    'prima_nota_entries|prima_nota_tenant_insert', jsonb_build_array('2238cbe5380ba0a1708c013c04d19a6d', '8b4bb7cd2c4d57ec5603a46995199117'),
    'prima_nota_entries|prima_nota_tenant_update', jsonb_build_array('f5529034280ecf93b279505f1cc4ae5f', '0c0cd56cb72d99cf68c497763ff464b0'),
    'appointments|appointments_lettura_authenticated', jsonb_build_array('a49b5b0658bf1f9828a151d6e771d1f2', '7d00d68b6c83808b126e0733fc208627'),
    'appointments|cliente_legge_propri_appuntamenti', jsonb_build_array('ed43a1e8d2a8824445ef12b68449c1f3', 'd19eba5801f0180b65218c5502980a23'),
    'order_statuses|Company admins can manage their order statuses', jsonb_build_array('2689d99181c541fdb674099c51adc331', 'c2fbe8b6776a5b5f2e103af316073b31'),
    'order_statuses|Customers can view their company order statuses', jsonb_build_array('c3a1f4cbc41d69dd59f1b7013ac6867a', '6cc53b71e9e19bb250400edc29684542'),
    'order_statuses|Staff can view their company order statuses', jsonb_build_array('5141c3cef0aa4bbb6bc3ab54161528c4', '9d0e4133870790bef15597f90daab130'),
    'order_external_teams|Company admins can manage their order external teams', jsonb_build_array('6580a76c8f3f2e1829de11886d7c82a9', 'bfd62d32afb2f98bf9470676b816a661'),
    'order_external_teams|Staff can view order external teams if permitted', jsonb_build_array('11790e519e9d147c6303b3203098348f', '8106da36175dbb0fd06e4fce8c1bad80'),
    'order_external_teams|Super admins can manage all order external teams', jsonb_build_array('cc12fea6ed9ad3a5e9ff8a0d7f1bd972', '56058d1d003c351b196b6cd19676da7d'),
    'employees|Company admins can manage their employees', jsonb_build_array('2331c3fb4718c6468aa6a452157755c6', '09dee463f7fc20002aa963df2b24ecc1'),
    'employees|Super admins can manage all employees', jsonb_build_array('cc12fea6ed9ad3a5e9ff8a0d7f1bd972', '56058d1d003c351b196b6cd19676da7d'),
    'employees|employees_lettura_public', jsonb_build_array('8fa463cd0b203532e895f603fbd7b53a', '9c3a5790edce239476030f09d6049537'),
    'staff_permissions|Company admins can manage staff permissions', jsonb_build_array('ebe5c8581663561ad861ab1ff4d9ab41', 'bcf3de10b76f55c0bedf874a9b43493a'),
    'staff_permissions|Super admins can manage all staff permissions', jsonb_build_array('858b5b0a1f7d6ace7a8122e6ef238057', '86af66260986998831192c6ce8a110d3'),
    'staff_permissions|staff_permissions_delete_admin', jsonb_build_array('ebc9ac07dd834feb403b0d10a2ffe7d1', '85abb5f40749ad329d5a246ffc973b71'));
  v_chiave text;
  v_tabella text;
  v_regola text;
  v_impronta text;
begin
  for v_chiave in select jsonb_object_keys(v_regole) loop
    v_tabella := split_part(v_chiave, '|', 1);
    v_regola := split_part(v_chiave, '|', 2);
    select md5(coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
      into v_impronta
      from pg_policy p
     where p.polrelid = ('public.' || v_tabella)::regclass and p.polname = v_regola;
    if v_impronta is null then
      raise exception 'Regola % su % non trovata', v_regola, v_tabella;
    end if;
    if not (v_regole -> v_chiave) ? v_impronta then
      raise exception 'Regola % su % cambiata dopo il censimento del 13/10/2026 (impronta %): rivedere prima di aggiornarla', v_regola, v_tabella, v_impronta;
    end if;
  end loop;
end $$;

-- Le sei tabelle si prendono subito, prima che il primo ALTER POLICY blocchi
-- anche le tabelle di auth: una lettura degli appuntamenti, che consulta
-- auth.users attraverso get_auth_email(), aspetta così all'ingresso della sua
-- tabella e non a metà strada.
lock table public.prima_nota_entries, public.appointments, public.order_statuses,
           public.order_external_teams, public.employees, public.staff_permissions
  in access exclusive mode;

-- 1. Prima nota: azienda, ruolo e permesso di chi legge, una volta per query.
alter policy prima_nota_entries_lettura_authenticated on public.prima_nota_entries
  using ((user_can_read_accountant_company(company_id) OR ((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role) OR ( SELECT e_amministratore_di(get_my_company_id()) AS e_amministratore_di) OR ( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text) AS has_permission)))));

alter policy prima_nota_super_admin on public.prima_nota_entries
  using (( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role));

alter policy prima_nota_tenant_delete on public.prima_nota_entries
  using (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role) OR ( SELECT e_amministratore_di(get_my_company_id()) AS e_amministratore_di))));

alter policy prima_nota_tenant_insert on public.prima_nota_entries
  with check (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role) OR ( SELECT e_amministratore_di(get_my_company_id()) AS e_amministratore_di) OR ( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text) AS has_permission))));

alter policy prima_nota_tenant_update on public.prima_nota_entries
  using (((company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role) OR ( SELECT e_amministratore_di(get_my_company_id()) AS e_amministratore_di) OR ( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text) AS has_permission))));

-- 2. Appuntamenti: permesso, azienda ed email di chi legge, una volta per query.
alter policy appointments_lettura_authenticated on public.appointments
  using (((( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_calendar'::text) AS has_permission) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND check_staff_visibility(( SELECT auth.uid() AS uid), assigned_to) AND (NOT ( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno)) AND ((order_id IS NOT NULL) OR (created_by = ( SELECT auth.uid() AS uid)) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR ( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_sopralluoghi'::text) AS has_permission))) OR ((assigned_to = ( SELECT auth.uid() AS uid)) AND (company_id = ( SELECT get_my_company_id() AS get_my_company_id)) AND (NOT ( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno))) OR ((contact_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM marketing_contacts mc
  WHERE ((mc.id = appointments.contact_id) AND (mc.email = ( SELECT get_auth_email() AS get_auth_email))))))));

alter policy cliente_legge_propri_appuntamenti on public.appointments
  using ((((( SELECT get_auth_email() AS get_auth_email) IS NOT NULL) AND (lower(COALESCE(booking_email, ''::text)) = lower(( SELECT get_auth_email() AS get_auth_email)))) OR cliente_contatto_ha_mia_email(contact_id)));

-- 3. Stati delle commesse.
alter policy "Company admins can manage their order statuses" on public.order_statuses
  using ((( SELECT has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AS has_role) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (NOT ( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno))));

alter policy "Customers can view their company order statuses" on public.order_statuses
  using (((company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (NOT ( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno))));

alter policy "Staff can view their company order statuses" on public.order_statuses
  using ((( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_orders'::text) AS has_permission) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (NOT ( SELECT utente_e_cliente_esterno() AS utente_e_cliente_esterno))));

-- 4. Squadre esterne delle commesse.
alter policy "Company admins can manage their order external teams" on public.order_external_teams
  using ((( SELECT has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AS has_role) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_external_teams.order_id) AND (o.company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)))))));

alter policy "Staff can view order external teams if permitted" on public.order_external_teams
  using ((( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_orders'::text) AS has_permission) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_external_teams.order_id) AND (o.company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)))))));

alter policy "Super admins can manage all order external teams" on public.order_external_teams
  using (( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role));

-- 5. Dipendenti (letti anche dalle regole di altre tabelle).
alter policy "Company admins can manage their employees" on public.employees
  using ((( SELECT has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AS has_role) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id))));

alter policy "Super admins can manage all employees" on public.employees
  using (( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role));

alter policy employees_lettura_public on public.employees
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT has_permission(( SELECT auth.uid() AS uid), 'can_view_employees'::text) AS has_permission) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)))));

-- 6. Permessi dello staff: per ultima, è la tabella che le funzioni delle
--    regole leggono più spesso, così il lock dura il meno possibile.
alter policy "Company admins can manage staff permissions" on public.staff_permissions
  using ((( SELECT has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AS has_role) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id))))
  with check ((( SELECT has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AS has_role) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = staff_permissions.user_id) AND ((p.company_id = staff_permissions.company_id) OR (EXISTS ( SELECT 1
           FROM multi_company_access mca
          WHERE ((mca.user_id = p.id) AND (mca.company_id = staff_permissions.company_id))))))))));

alter policy "Super admins can manage all staff permissions" on public.staff_permissions
  using (( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role))
  with check ((( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE (p.id = staff_permissions.user_id)))));

alter policy staff_permissions_delete_admin on public.staff_permissions
  using (((( SELECT has_role(( SELECT auth.uid() AS uid), 'company_admin'::app_role) AS has_role) AND (company_id = ( SELECT get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id))) OR ( SELECT has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role) AS has_role)));

-- Controllo finale: ogni regola ha esattamente il testo verificato (stessa
-- impronta nuova della guardia), altrimenti la migrazione si annulla tutta.
do $$
declare
  v_nuove constant jsonb := jsonb_build_object(
    'prima_nota_entries|prima_nota_entries_lettura_authenticated', '3dc50c6f0ac1f654f166fc503014e8f8',
    'prima_nota_entries|prima_nota_super_admin', '56058d1d003c351b196b6cd19676da7d',
    'prima_nota_entries|prima_nota_tenant_delete', '1f2ae0bf47b9ffdd3c9891885e699e97',
    'prima_nota_entries|prima_nota_tenant_insert', '8b4bb7cd2c4d57ec5603a46995199117',
    'prima_nota_entries|prima_nota_tenant_update', '0c0cd56cb72d99cf68c497763ff464b0',
    'appointments|appointments_lettura_authenticated', '7d00d68b6c83808b126e0733fc208627',
    'appointments|cliente_legge_propri_appuntamenti', 'd19eba5801f0180b65218c5502980a23',
    'order_statuses|Company admins can manage their order statuses', 'c2fbe8b6776a5b5f2e103af316073b31',
    'order_statuses|Customers can view their company order statuses', '6cc53b71e9e19bb250400edc29684542',
    'order_statuses|Staff can view their company order statuses', '9d0e4133870790bef15597f90daab130',
    'order_external_teams|Company admins can manage their order external teams', 'bfd62d32afb2f98bf9470676b816a661',
    'order_external_teams|Staff can view order external teams if permitted', '8106da36175dbb0fd06e4fce8c1bad80',
    'order_external_teams|Super admins can manage all order external teams', '56058d1d003c351b196b6cd19676da7d',
    'employees|Company admins can manage their employees', '09dee463f7fc20002aa963df2b24ecc1',
    'employees|Super admins can manage all employees', '56058d1d003c351b196b6cd19676da7d',
    'employees|employees_lettura_public', '9c3a5790edce239476030f09d6049537',
    'staff_permissions|Company admins can manage staff permissions', 'bcf3de10b76f55c0bedf874a9b43493a',
    'staff_permissions|Super admins can manage all staff permissions', '86af66260986998831192c6ce8a110d3',
    'staff_permissions|staff_permissions_delete_admin', '85abb5f40749ad329d5a246ffc973b71');
  v_chiave text;
  v_impronta text;
begin
  for v_chiave in select jsonb_object_keys(v_nuove) loop
    select md5(coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
      into v_impronta
      from pg_policy p
     where p.polrelid = ('public.' || split_part(v_chiave, '|', 1))::regclass and p.polname = split_part(v_chiave, '|', 2);
    if v_impronta is distinct from v_nuove ->> v_chiave then
      raise exception 'Regola % dopo la modifica ha impronta % invece di %', v_chiave, v_impronta, v_nuove ->> v_chiave;
    end if;
  end loop;
end $$;
