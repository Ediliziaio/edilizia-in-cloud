-- Controllo di gestione: personale, fondo TFR e patrimonio netto nel conto economico e nello
-- Stato patrimoniale (migrazioni 20290401170000-20290401200000). Gira sul database ricostruito
-- da zero (scripts/test-migration-history.py), in una transazione annullata, con numeri fissi
-- calcolati a mano:
--
--   Dipendente A: 12 cedolini 2025, lordo 2.700 → TFR 200 al mese, resta in azienda.
--   Dipendente B: 12 cedolini 2025, lordo 1.350 → TFR 100 al mese; dal 1/7 al fondo pensione.
--   Fondo TFR all'1/1/2025 10.000; liquidazione di 1.000 il 30/6/2025.
--   Rivalutazione 2025: (10.000 − 1.000) × 2,311148% = 208,00; imposta 17% = 35,36.
--   Fondo al 31/12/2025: 10.000 + 2.400 + 600 − 1.000 + 208,00 − 35,36 = 12.172,64.
--   Costo del personale 2025: A 12 × (2.700 + 800 + 200) + B 12 × (1.350 + 400 + 100) + 208 = 66.808,00.
begin;
set local session_replication_role = replica;
insert into companies(id, name, email, status, payment_method)
  values ('c9000000-0000-4000-a000-000000000001', 'Laboratorio CdG CI', 'cdg@example.test', 'active', 'comped');
insert into auth.users(id) values ('c9000000-0000-4000-a000-000000000002');
insert into profiles(id, company_id, first_name, last_name, email)
  values ('c9000000-0000-4000-a000-000000000002', 'c9000000-0000-4000-a000-000000000001', 'Titolare', 'CdG', 'titolare-cdg@example.test');
insert into user_roles(user_id, role) values ('c9000000-0000-4000-a000-000000000002', 'company_admin');
insert into employees(id, company_id, first_name, last_name, is_active) values
  ('c9000000-0000-4000-a000-00000000000a', 'c9000000-0000-4000-a000-000000000001', 'Anna', 'Azienda', true),
  ('c9000000-0000-4000-a000-00000000000b', 'c9000000-0000-4000-a000-000000000001', 'Bruno', 'Fondo', true);
-- cedolini è una vista su hr_cedolini (il nome viene dal dipendente).
insert into hr_cedolini(company_id, employee_id, anno, mese, lordo, contributi_dipendente,
                        contributi_datore, ritenute_irpef, netto, stato, data_pagamento)
select 'c9000000-0000-4000-a000-000000000001', e.id, 2025, m, e.lordo, e.cdip, e.cdat, e.rit, e.netto, 'pagato',
       (make_date(2025, m, 1) + interval '1 month' - interval '1 day')::date
  from generate_series(1, 12) m,
       (values ('c9000000-0000-4000-a000-00000000000a'::uuid, 2700, 300, 800, 400, 2000),
               ('c9000000-0000-4000-a000-00000000000b'::uuid, 1350, 150, 400, 200, 1000))
       as e(id, lordo, cdip, cdat, rit, netto);
insert into patrimonio_netto(company_id, esercizio, capitale_sociale, riserva_legale, riserva_straordinaria,
                             altre_riserve, utili_perdite_a_nuovo, utile_perdita_esercizio, fondo_tfr, fondo_rischi, altri_fondi, fonte)
  values ('c9000000-0000-4000-a000-000000000001', 2025, 10000, 2000, 3000, 0, 0, 0, 10000, 0, 0, 'manuale');
insert into cg_tfr_movimenti(company_id, employee_id, tipo, data, importo)
  values ('c9000000-0000-4000-a000-000000000001', 'c9000000-0000-4000-a000-00000000000a', 'liquidazione', '2025-06-30', 1000);
insert into cg_tfr_destinazioni(employee_id, company_id, destinazione, dal)
  values ('c9000000-0000-4000-a000-00000000000b', 'c9000000-0000-4000-a000-000000000001', 'fondo_pensione', '2025-07-01');
set local session_replication_role = origin;

set local request.jwt.claims = '{"role":"authenticated","sub":"c9000000-0000-4000-a000-000000000002"}';
set local request.jwt.claim.sub = 'c9000000-0000-4000-a000-000000000002';
set local role authenticated;
do $$
declare
  c constant uuid := 'c9000000-0000-4000-a000-000000000001';
  v_ce numeric; v_mesi numeric; v_det numeric; v_l numeric;
  sp jsonb; p jsonb; sp26 jsonb;
begin
  -- Conto economico: costo del personale con il TFR e la rivalutazione; mesi e dettaglio sommano uguale.
  select (v ->> 'valore')::numeric into v_ce
    from jsonb_array_elements(public.cg_get_conto_economico_riclassificato(c, 2025) -> 'voci') v where v ->> 'codice' = '06';
  if v_ce is distinct from 66808.00 then raise exception 'CE 06 2025: atteso 66808.00, trovato %', v_ce; end if;
  select sum((v ->> 'valore')::numeric) into v_mesi
    from generate_series(1, 12) m, jsonb_array_elements(public.cg_get_conto_economico_riclassificato(c, 2025, m, m) -> 'voci') v
   where v ->> 'codice' = '06';
  if v_mesi is distinct from v_ce then raise exception 'CE 06 2025: somma dei mesi % diversa dall''anno %', v_mesi, v_ce; end if;
  v_det := (public.cg_get_dettaglio_voce_mese(c, 2025, null, '06') -> 'meta' ->> 'totale')::numeric;
  if v_det is distinct from v_ce then raise exception 'Dettaglio 06 2025: % diverso dal CE %', v_det, v_ce; end if;

  -- Stato patrimoniale al 31/12/2025.
  sp := public.cg_get_stato_patrimoniale_riclassificato(c, 2025, '2025-12-31');
  p := sp -> 'meta' -> 'patrimonio';
  if (p ->> 'tfr_maturato')::numeric is distinct from 3000.00 then raise exception 'TFR maturato in azienda: atteso 3000, trovato %', p ->> 'tfr_maturato'; end if;
  if (p ->> 'tfr_ai_fondi')::numeric is distinct from 600.00 then raise exception 'TFR ai fondi: atteso 600, trovato %', p ->> 'tfr_ai_fondi'; end if;
  if (p ->> 'tfr_liquidato')::numeric is distinct from 1000.00 then raise exception 'TFR liquidato: atteso 1000, trovato %', p ->> 'tfr_liquidato'; end if;
  if (p ->> 'tfr_rivalutazione_anno')::numeric is distinct from 208.00 then raise exception 'Rivalutazione 2025: attesa 208.00, trovata %', p ->> 'tfr_rivalutazione_anno'; end if;
  if (p ->> 'tfr_rivalutazione_netta')::numeric is distinct from 172.64 then raise exception 'Rivalutazione netta: attesa 172.64, trovata %', p ->> 'tfr_rivalutazione_netta'; end if;
  if (p ->> 'tfr_coefficiente_stimato')::boolean then raise exception 'Coefficiente 2025 stimato: dicembre 2025 manca'; end if;
  if (sp -> 'passivo' ->> 'fondo_tfr')::numeric is distinct from 12172.64 then raise exception 'Fondo TFR 31/12/2025: atteso 12172.64, trovato %', sp -> 'passivo' ->> 'fondo_tfr'; end if;
  -- Acconto del 90% versato il 16/12: restano 35,36 − 31,82.
  if (p ->> 'tfr_imposta_sostitutiva_da_versare')::numeric is distinct from 3.54 then raise exception 'Imposta sostitutiva da versare: attesa 3.54, trovata %', p ->> 'tfr_imposta_sostitutiva_da_versare'; end if;
  -- Contributi di dicembre (1.100 + 550) e TFR del quarto trimestre al fondo pensione (300), fino al 16/1.
  if (sp -> 'passivo' ->> 'debiti_previdenziali')::numeric is distinct from 1950.00 then raise exception 'Debiti previdenziali: attesi 1950, trovati %', sp -> 'passivo' ->> 'debiti_previdenziali'; end if;
  -- Stipendi pagati entro la data: nessun debito verso il personale.
  if (sp -> 'passivo' ->> 'debiti_personale')::numeric is distinct from 0 then raise exception 'Debiti verso il personale: attesi 0, trovati %', sp -> 'passivo' ->> 'debiti_personale'; end if;

  -- 2026 senza riga: si riparte dal 2025 con l'utile del conto economico, e il fondo resta.
  select (v ->> 'valore')::numeric into v_l
    from jsonb_array_elements(public.cg_get_conto_economico_riclassificato(c, 2025) -> 'voci') v where v ->> 'codice' = 'L';
  sp26 := public.cg_get_stato_patrimoniale_riclassificato(c, 2026, '2026-01-31');
  if (sp26 -> 'passivo' ->> 'capitale_sociale')::numeric is distinct from 10000.00 then raise exception 'Capitale 2026: atteso 10000, trovato %', sp26 -> 'passivo' ->> 'capitale_sociale'; end if;
  if (sp26 -> 'passivo' ->> 'riserve')::numeric is distinct from 5000.00 + v_l then raise exception 'Riserve 2026: attese % (5000 + utile 2025), trovate %', 5000.00 + v_l, sp26 -> 'passivo' ->> 'riserve'; end if;
  if (sp26 -> 'passivo' ->> 'fondo_tfr')::numeric is distinct from 12172.64 then raise exception 'Fondo TFR 31/1/2026: atteso 12172.64, trovato %', sp26 -> 'passivo' ->> 'fondo_tfr'; end if;
  -- Saldo 2025 dell'imposta sostitutiva entro il 16/2/2026.
  if (sp26 -> 'meta' -> 'patrimonio' ->> 'tfr_imposta_sostitutiva_da_versare')::numeric is distinct from 3.54 then
    raise exception 'Saldo imposta sostitutiva 2025 al 31/1/2026: atteso 3.54, trovato %', sp26 -> 'meta' -> 'patrimonio' ->> 'tfr_imposta_sostitutiva_da_versare';
  end if;
end $$;

-- Il dipendente di un'altra azienda non si collega.
do $$
begin
  begin
    insert into public.cg_tfr_movimenti(company_id, employee_id, tipo, data, importo)
      values ('c9000000-0000-4000-a000-000000000001', gen_random_uuid(), 'anticipo', '2025-06-30', 1);
    raise exception 'Movimento TFR accettato con un dipendente che non è dell''azienda';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;
rollback;
