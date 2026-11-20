-- Controllo di gestione: crediti verso clienti e debiti verso fornitori alla data nello Stato
-- patrimoniale (migrazioni 20290401110000, 20290401150000, 20290401160000). Gira sul database
-- ricostruito da zero, in una transazione annullata, con numeri fissi al 31/12/2025:
--
--   Crediti: fattura da 12.200 con un incasso di 6.100 registrato solo nell'app (6.100 aperti);
--   fattura da 1.220 incassata a ottobre (0); fattura da 2.440 incassata il 10/1/2026 (2.440 alla
--   data). Totale 8.540.
--   Debiti: costo da 1.000 non pagato (1.000); costo da 500 col bonifico abbinato in banca il 20/12
--   ma col flag «non pagato» (0); costo da 2.000 pagato il 15/1/2026 (2.000 alla data); costo da
--   1.000 di imponibile da una fattura ricevuta da 1.220 non pagata (1.220). Totale 4.220.
--   I primi tre costi sono senza IVA. Una seconda prova aggiunge 100 imponibili al 22%
--   e un bonifico parziale da 21, con un residuo di 101.
begin;
set local session_replication_role = replica;
insert into companies(id, name, email, status, payment_method)
  values ('c9100000-0000-4000-a000-000000000001', 'Laboratorio crediti CI', 'crediti@example.test', 'active', 'comped');
insert into auth.users(id) values ('c9100000-0000-4000-a000-000000000002');
insert into profiles(id, company_id, first_name, last_name, email)
  values ('c9100000-0000-4000-a000-000000000002', 'c9100000-0000-4000-a000-000000000001', 'Titolare', 'Crediti', 'titolare-crediti@example.test');
insert into user_roles(user_id, role) values ('c9100000-0000-4000-a000-000000000002', 'company_admin');

insert into invoices(id, company_id, client_company_name, invoice_number, issue_date, document_type, status, total, tax_amount, paid_amount, payment_date) values
  ('c9100000-0000-4000-a000-0000000000a1', 'c9100000-0000-4000-a000-000000000001', 'Cliente Uno', '1', '2025-11-10', 'invoice', 'sent', 12200, 2200, 0, null),
  ('c9100000-0000-4000-a000-0000000000a2', 'c9100000-0000-4000-a000-000000000001', 'Cliente Due', '2', '2025-10-01', 'invoice', 'paid', 1220, 220, 1220, '2025-10-20'),
  ('c9100000-0000-4000-a000-0000000000a3', 'c9100000-0000-4000-a000-000000000001', 'Cliente Tre', '3', '2025-12-01', 'invoice', 'paid', 2440, 440, 2440, '2026-01-10');
insert into invoice_payments(invoice_id, company_id, amount, payment_date)
  values ('c9100000-0000-4000-a000-0000000000a1', 'c9100000-0000-4000-a000-000000000001', 6100, '2025-12-05');

insert into suppliers(id, company_id, name) values ('c9100000-0000-4000-a000-0000000000b1', 'c9100000-0000-4000-a000-000000000001', 'Fornitore CI');
insert into company_costs(id, company_id, name, due_date, amount, vat_rate, supplier_id, mese_competenza, is_paid, paid_date) values
  ('c9100000-0000-4000-a000-0000000000c1', 'c9100000-0000-4000-a000-000000000001', 'Materiali', '2025-12-15', 1000, 0, 'c9100000-0000-4000-a000-0000000000b1', '2025-11-01', false, null),
  ('c9100000-0000-4000-a000-0000000000c2', 'c9100000-0000-4000-a000-000000000001', 'Noleggio', '2025-12-15', 500, 0, 'c9100000-0000-4000-a000-0000000000b1', '2025-11-01', false, null),
  ('c9100000-0000-4000-a000-0000000000c3', 'c9100000-0000-4000-a000-000000000001', 'Ponteggi', '2026-01-15', 2000, 0, 'c9100000-0000-4000-a000-0000000000b1', '2025-12-01', true, '2026-01-15'),
  ('c9100000-0000-4000-a000-0000000000c4', 'c9100000-0000-4000-a000-000000000001', 'Fattura ricevuta', '2026-01-31', 1000, 22, null, '2025-12-01', false, null);
insert into fatture_ricevute(company_id, cedente_ragione_sociale, numero_fattura, data_fattura, company_cost_id,
                             imponibile_totale, totale_documento, netto_a_pagare)
  values ('c9100000-0000-4000-a000-000000000001', 'Altro Fornitore', 'A-1', '2025-12-01', 'c9100000-0000-4000-a000-0000000000c4', 1000, 1220, 1220);
insert into bank_accounts(id, company_id, external_account_id)
  values ('c9100000-0000-4000-a000-0000000000d1', 'c9100000-0000-4000-a000-000000000001', 'ci-conto');
insert into bank_transactions(company_id, account_id, external_transaction_id, amount, value_date, booking_date, linked_cost_id)
  values ('c9100000-0000-4000-a000-000000000001', 'c9100000-0000-4000-a000-0000000000d1', 'ci-mov-1', -500, '2025-12-20', '2025-12-20', 'c9100000-0000-4000-a000-0000000000c2');
set local session_replication_role = origin;

set local request.jwt.claims = '{"role":"authenticated","sub":"c9100000-0000-4000-a000-000000000002"}';
set local request.jwt.claim.sub = 'c9100000-0000-4000-a000-000000000002';
set local role authenticated;
do $$
declare
  sp jsonb := public.cg_get_stato_patrimoniale_riclassificato('c9100000-0000-4000-a000-000000000001', 2025, '2025-12-31');
  sp_nov jsonb := public.cg_get_stato_patrimoniale_riclassificato('c9100000-0000-4000-a000-000000000001', 2025, '2025-11-30');
begin
  if (sp -> 'attivo' ->> 'crediti_clienti')::numeric is distinct from 8540.00 then
    raise exception 'Crediti verso clienti al 31/12/2025: attesi 8540, trovati %', sp -> 'attivo' ->> 'crediti_clienti';
  end if;
  if (sp -> 'passivo' ->> 'debiti_fornitori')::numeric is distinct from 4220.00 then
    raise exception 'Debiti verso fornitori al 31/12/2025: attesi 4220, trovati %', sp -> 'passivo' ->> 'debiti_fornitori';
  end if;
  -- Al 30/11: la fattura 1 è tutta aperta (12.200), la 3 non c'è ancora; i costi di dicembre
  -- nemmeno, e il bonifico del 20/12 non era ancora partito (1.000 + 500).
  if (sp_nov -> 'attivo' ->> 'crediti_clienti')::numeric is distinct from 12200.00 then
    raise exception 'Crediti verso clienti al 30/11/2025: attesi 12200, trovati %', sp_nov -> 'attivo' ->> 'crediti_clienti';
  end if;
  if (sp_nov -> 'passivo' ->> 'debiti_fornitori')::numeric is distinct from 1500.00 then
    raise exception 'Debiti verso fornitori al 30/11/2025: attesi 1500, trovati %', sp_nov -> 'passivo' ->> 'debiti_fornitori';
  end if;
end $$;
reset role;

set local session_replication_role = replica;
insert into company_costs(id,company_id,name,due_date,amount,vat_rate,supplier_id,mese_competenza,is_paid) values
  ('c9100000-0000-4000-a000-0000000000c5','c9100000-0000-4000-a000-000000000001','Costo con IVA e acconto',
    '2025-12-15',100,22,'c9100000-0000-4000-a000-0000000000b1','2025-12-01',false);
insert into bank_transactions(company_id,account_id,external_transaction_id,amount,transaction_type,value_date,booking_date,linked_cost_id)
  values ('c9100000-0000-4000-a000-000000000001','c9100000-0000-4000-a000-0000000000d1','ci-mov-2',-21,'debit',
    '2025-12-20','2025-12-20','c9100000-0000-4000-a000-0000000000c5');
set local session_replication_role = origin;
set local role authenticated;
do $$
declare
  debiti numeric := (public.cg_get_stato_patrimoniale_riclassificato(
    'c9100000-0000-4000-a000-000000000001',2025,'2025-12-31') #>> '{passivo,debiti_fornitori}')::numeric;
begin
  if debiti is distinct from 4321.00 then
    raise exception 'Debiti al lordo IVA con acconto: attesi 4321, trovati %',debiti;
  end if;
end $$;
reset role;
rollback;
