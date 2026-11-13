create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('test.role',true),''),'authenticated')$$;
create table test_permissions(company_id uuid,write boolean default true,admin boolean default true,hr boolean default true);
create function has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.test_permissions where p<>'__solo_amministratori__' and company_id=c and (p<>'can_reconcile_bank_transactions' or write))$$;
create function e_amministratore_di(c uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.test_permissions where company_id=c and admin and hr)$$;
create function is_super_admin(uuid) returns boolean language sql stable as $$select false$$;
create function utente_sola_lettura(c uuid) returns boolean language sql stable security definer as $$select not coalesce((select write from public.test_permissions where company_id=c),false)$$;
create function utente_bloccato() returns boolean language sql stable as $$select coalesce(current_setting('test.blocked',true),'')='true'$$;
create function utente_e_cliente_esterno() returns boolean language sql stable as $$select coalesce(current_setting('test.external',true),'')='true'$$;
create function user_can_read_accountant_company(uuid) returns boolean language sql stable as $$select false$$;
create function puo_incassare_fatture(c uuid) returns boolean language sql stable as $$select not public.utente_sola_lettura(c)$$;
create function puo_gestire_scadenze(c uuid) returns boolean language sql stable as $$select not public.utente_sola_lettura(c)$$;
create table companies(id uuid primary key);
create table bank_accounts(id uuid primary key,company_id uuid,account_name text,display_name text,is_manual boolean default false);
create table bank_transactions(id uuid primary key default gen_random_uuid(),company_id uuid,account_id uuid,booking_date date,value_date date,amount numeric,currency text default 'EUR',description text,creditor_name text,debtor_name text,creditor_iban text,debtor_iban text,reference text,transaction_type text,status text default 'booked',category text,note text,metadata jsonb default '{}',reconciliation_status text default 'pending',chiuso_senza_documento text,reconciliation_suggestions uuid[],reconciled_at timestamptz,linked_invoice_id uuid,linked_cost_id uuid,linked_installment_id uuid,linked_scadenza_id uuid);
create view bank_accounts_operativi as select * from bank_accounts;
create view bank_transactions_operativi as select * from bank_transactions;
create table documenti_fiscali(id uuid primary key,company_id uuid,ordine_id uuid,numero text,cliente_snapshot jsonb,tipo text default 'fattura',stato text default 'emessa',deleted_at timestamptz,totale_da_pagare numeric,importo_pagato numeric default 0,data_scadenza date);
create view documenti_fiscali_elenco_operativo as select *, 'nativa'::text origine,0::numeric stornato from documenti_fiscali;
create table invoices(id uuid primary key,company_id uuid,invoice_number text,order_id uuid);
create table company_costs(id uuid primary key,company_id uuid,name text,order_id uuid);
create table suppliers(id uuid primary key,company_id uuid,name text);
create table scadenze(id uuid primary key,company_id uuid,invoice_id uuid,order_id uuid,cost_id uuid,supplier_id uuid,description text,notes text,direction text,amount numeric,paid_amount numeric default 0,status text default 'da_pagare',is_previsionale boolean default false,due_date date);
create table prima_nota_entries(id uuid primary key default gen_random_uuid(),company_id uuid,documento_fiscale_id uuid,invoice_id uuid,cost_id uuid,order_id uuid,scadenza_id uuid,movimento_id uuid,amount numeric,direction text,description text,entry_date date,bank_transaction_id uuid,reversal_of uuid,payment_method text,notes text,reference_number text);
create table bank_reconciliations(id uuid primary key default gen_random_uuid(),company_id uuid,transaction_id uuid,invoice_id uuid,scadenza_id uuid,movimento_id uuid,documento_id uuid,matched_amount numeric,notes text,matched_at timestamptz default now(),matched_by uuid,match_type text,unmatched_at timestamptz,unmatch_reason text,ripartita boolean default true);
create table movimenti_cassa_native(id uuid primary key,company_id uuid,documento_id uuid);
create table fattura_ordine(company_id uuid,fattura_id uuid,ordine_id uuid);
create table orders(id uuid primary key,company_id uuid,order_code text,description text,deleted_at timestamptz);
create view orders_visibili as select * from orders;
create table mezzi(id uuid primary key,company_id uuid,nome text,targa text,deleted_at timestamptz);
create table hr_profili(id uuid primary key,company_id uuid,nome text,cognome text);
create table employees(id uuid primary key,company_id uuid,first_name text,last_name text);
create table hr_cedolini(id uuid primary key,company_id uuid,employee_id uuid,mese int,anno int);
create function scollega_riga_ripartita(p_riconciliazione uuid) returns jsonb language plpgsql as $$declare rc bank_reconciliations;begin select * into rc from bank_reconciliations where id=p_riconciliazione; IF NOT rc.ripartita THEN raise exception 'legacy';end if;return '{}';end$$;
-- Same operator immutability guard used in production, with annotations added by the migration.
CREATE OR REPLACE FUNCTION public.bank_transaction_operator_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row_company uuid; row_account uuid; manual_account boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN coalesce(NEW,OLD); END IF;
 row_company:=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
 row_account:=CASE WHEN TG_OP='DELETE' THEN OLD.account_id ELSE NEW.account_id END;
 IF public.has_permission_for_company(auth.uid(),'__solo_amministratori__',row_company) THEN RETURN coalesce(NEW,OLD); END IF;
 SELECT is_manual INTO manual_account FROM public.bank_accounts WHERE id=row_account AND company_id=row_company;
 IF NOT coalesce(manual_account,false) AND (TG_OP IN ('INSERT','DELETE') OR
   (to_jsonb(NEW)-ARRAY['category','category_icon','note','linked_cost_id','linked_installment_id','linked_invoice_id','linked_scadenza_id','reconciled_at','reconciled_invoice_id','reconciliation_status','reconciliation_suggestions','chiuso_senza_documento'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['category','category_icon','note','linked_cost_id','linked_installment_id','linked_invoice_id','linked_scadenza_id','reconciled_at','reconciled_invoice_id','reconciliation_status','reconciliation_suggestions','chiuso_senza_documento'])) THEN
  RAISE EXCEPTION 'I dati importati dalla banca non si possono riscrivere' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
  RAISE EXCEPTION 'Non puoi spostare un movimento tra conti o aziende' USING ERRCODE='42501';
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.bank_transaction_operator_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank_transaction_operator_guard ON public.bank_transactions;
CREATE TRIGGER bank_transaction_operator_guard BEFORE INSERT OR UPDATE OR DELETE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.bank_transaction_operator_guard();

create view documenti_fiscali_native as select * from documenti_fiscali;
CREATE OR REPLACE FUNCTION public.bank_reconciliation_tenant_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ref record; ref_id uuid; valid boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
  RAISE EXCEPTION 'Non puoi spostare una riconciliazione tra aziende' USING ERRCODE='42501';
 END IF;
 FOR ref IN SELECT * FROM (VALUES ('transaction_id','bank_transactions'),('invoice_id','invoices'),('scadenza_id','scadenze'),('movimento_id','movimenti_cassa_native'),('documento_id','documenti_fiscali_native')) AS refs(col,tab) LOOP
  ref_id:=(to_jsonb(NEW)->>ref.col)::uuid;
  IF ref_id IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id=$1 AND company_id=$2)',ref.tab) INTO valid USING ref_id,NEW.company_id;
  IF NOT coalesce(valid,false) THEN RAISE EXCEPTION 'Documento o movimento non disponibile in questa azienda' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bank_reconciliation_tenant_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank_reconciliation_tenant_guard ON public.bank_reconciliations;
CREATE TRIGGER bank_reconciliation_tenant_guard BEFORE INSERT OR UPDATE ON public.bank_reconciliations FOR EACH ROW EXECUTE FUNCTION public.bank_reconciliation_tenant_guard();

grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;
