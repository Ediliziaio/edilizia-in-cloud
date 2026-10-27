-- CHI NON HA FATTO L'ACCESSO NON LEGGE PIÙ TUTTO LO SCHEMA
--
-- Le privilegi di partenza dello schema `public` danno ad `anon` tutti i diritti
-- su ogni tabella nuova: 967 tabelle su 1.187, e in 963 anche la scrittura. A
-- fermare chi non ha fatto l'accesso c'era solo la RLS.
--
-- Provato tabella per tabella mettendosi nei panni di `anon` (967 tabelle e 84
-- viste), e poi dall'esterno con la chiave pubblica. Quello che si vedeva senza
-- nessun token:
--   * `admin_dashboard_summary` → 200: aziende totali, MRR, ARR, MRR regalato,
--     conversione dei trial, utenti. I numeri della piattaforma.
--   * `mv_company_metrics` → 200: nome, stato, MRR di listino e incassato,
--     utenti, clienti e ordini di OGNI azienda cliente.
--   * `fattura_pagamento_stato`: totale, incassato e residuo delle fatture.
-- Le viste non sono protette dalla RLS delle tabelle sotto: girano con i diritti
-- del proprietario. Per questo la RLS non bastava e queste tre erano aperte.
--
-- Qui si toglie tutto ad `anon` e si rimette SOLO ciò che una pagina pubblica usa
-- davvero, con il motivo accanto. `authenticated` e `service_role` non si toccano.

revoke all on all tables in schema public from anon;

-- ── Cataloghi e contenuti pubblici per scelta ───────────────────────────────
grant select on public.business_verticals        to anon; -- elenco dei settori, serve ai form pubblici
grant select on public.vertical_persona_overrides to anon; -- testi per settore delle pagine pubbliche
grant select on public.whitelabel_tiers          to anon; -- livelli white label mostrati fuori dall'app
grant select on public.company_branding          to anon; -- logo e colori: la policy filtra is_active = true
grant select on public.lead_forms                to anon; -- i form pubblicati (policy: is_published = true)
grant select on public.hr_talent_questions       to anon; -- domande del form talent (policy: active = true)

-- ── Calcolatore fotovoltaico pubblico ──────────────────────────────────────
grant select on public.fv_incentivi_catalogo   to anon;
grant select on public.fv_parametri_calcolo    to anon;
grant select on public.fv_profili_autoconsumo  to anon;
grant select on public.fv_pvgis_cache          to anon;
grant select on public.fv_solar_api_cache      to anon;

-- ── Prenotazione appuntamenti dal sito ─────────────────────────────────────
grant select on public.marketing_calendar_availability to anon; -- fasce disponibili
grant select on public.outlook_calendar_events         to anon; -- slot occupati, via i calendari pubblicati
grant insert on public.appointments                    to anon; -- la prenotazione vera (policy sul booking_slug)
grant select on public.public_booking_calendars    to anon;
grant select on public.public_appointment_slots    to anon;
grant select on public.public_calendar_busy_slots  to anon;
grant select on public.public_calendar_owner_prefs to anon;

-- ── Altre vie pubbliche esistenti ──────────────────────────────────────────
grant select on public.sr_progetti           to anon; -- offerta serramenti col public_token
grant select on public.company_qr_codes      to anon; -- QR pubblici attivi e non scaduti
grant insert on public.company_qr_scan_logs  to anon; -- la scansione si registra
grant insert on public.partner_applications  to anon; -- candidatura partner dal sito
grant select on public.ai_personas_public          to anon;
grant select on public.referral_leaderboard_public to anon;

-- ── Cosa resta chiuso, e perché ────────────────────────────────────────────
-- `quotes` e `quote_items`: le loro policy col token sono INERTI. Provato
--   dall'esterno con un token valido: 401 «permission denied for function
--   aziende_con_permesso», perché un'altra policy della stessa tabella, aperta al
--   ruolo `public`, chiama una funzione che `anon` non può eseguire, e l'errore
--   uccide tutta la query. Oggi quella strada non funziona per nessuno. Se si
--   vuole farla funzionare, la cura non è il GRANT: è restringere quell'altra
--   policy ad `authenticated`. Allora qui servirà `grant select on public.quotes,
--   public.quote_items to anon`.
-- `whitelabel_audit_log`: `anon` poteva INSERIRE righe nel registro di controllo
--   con regola `true`.
-- `distance_matrix_cache` e `material_price_index`: cache di servizio, lette con
--   regola `true`. Nessuna pagina pubblica le usa.
-- `plan_ai_budgets`: budget AI per piano, configurazione della piattaforma.
-- `fattura_pagamento_stato`, `mv_company_metrics`, `admin_dashboard_summary`: le
--   tre viste che perdevano i dati.

-- ── La causa, non solo l'effetto ───────────────────────────────────────────
-- Senza questo, ogni tabella creata da qui in avanti nasce di nuovo aperta ad
-- `anon` e il giro va rifatto. `authenticated` e `service_role` restano come sono.
alter default privileges for role postgres in schema public revoke all on tables from anon;
