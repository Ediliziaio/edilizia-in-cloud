-- Applicata in produzione il 7 settembre 2026 via MCP.
--
-- I cedolini stavano in DUE tabelle diverse, e nessuno se n'era accorto perche'
-- erano entrambe vuote:
--
--   `cedolini`     15 colonne, il nome del dipendente come testo libero.
--                  Ci scrive e ci legge l'area azienda. Da qui leggono anche
--                  nove funzioni: tutto il controllo di gestione, `f24_componi`
--                  per le ritenute, `cu_componi`, la stampa, un tool di Silvio.
--   `hr_cedolini`  35 colonne: ore per fascia, straordinari 25/50/100,
--                  indennita', PDF, date di emissione e pagamento, revisione
--                  del consulente, avvisi di validazione. Ci legge l'app
--                  dell'operaio e ci scrive `cedolino_genera`, il motore CCNL.
--
-- Risultato: un cedolino creato dall'ufficio era invisibile all'operaio, e uno
-- generato dal motore CCNL era invisibile all'ufficio e non entrava nell'F24.
--
-- L'archivio diventa uno solo, `hr_cedolini`, che e' quello progettato meglio.
-- Il nome vecchio resta come VISTA, cosi' le nove funzioni continuano a leggere
-- senza toccarle una per una, e il nome del dipendente lo prende dall'anagrafica
-- invece che da un campo di testo.
--
-- Provate dopo il cambio, su dati veri in transazione annullata: f24_componi,
-- cu_componi, cg_get_health_check, cg_get_conto_economico_riclassificato,
-- cg_get_cash_flow_prospettico, cg_get_stato_patrimoniale_riclassificato e
-- cg_get_dettaglio_voce_mese rispondono tutte senza errori.

-- 1. Il contributo del datore esisteva solo nella tabella vecchia.
alter table public.hr_cedolini
  add column if not exists contributi_datore numeric not null default 0;

-- 2. La tabella vecchia e' vuota (verificato: zero righe) e non serve piu' come
--    archivio. La si mette da parte invece di cancellarla.
alter table if exists public.cedolini rename to cedolini_legacy;

-- 3. Il nome vecchio torna come vista sull'archivio unico, con le stesse
--    colonne di prima piu' quelle che servivano.
create or replace view public.cedolini as
  select
    c.id,
    c.company_id,
    c.employee_id,
    btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as employee_name,
    c.mese,
    c.anno,
    c.lordo,
    c.contributi_dipendente,
    c.contributi_datore,
    c.ritenute_irpef,
    c.netto,
    c.stato,
    c.note,
    c.created_at,
    c.pdf_url,
    c.data_emissione,
    c.data_pagamento
  from public.hr_cedolini c
  left join public.employees e on e.id = c.employee_id;

comment on view public.cedolini is
  'Vista di compatibilita'' su hr_cedolini, che e'' l''unico archivio dei cedolini. Il nome del dipendente arriva dall''anagrafica. Per scrivere si usa hr_cedolini o cedolino_genera.';

-- La vista eredita le regole di hr_cedolini (security_invoker), quindi chi
-- legge vede solo i cedolini che gia' poteva vedere.
alter view public.cedolini set (security_invoker = true);

revoke all on public.cedolini from public, anon;
grant select on public.cedolini to authenticated, service_role;
