// Database PGlite isolato con gli SQL veri della liquidazione IVA (fasi 0 e 1.1).
// Usato da ivaRicezioneImpostazioni.test.ts e ivaCaos.test.ts.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

export const c = "10000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000001",
  u = "10000000-0000-4000-8000-000000000002";

export const migrazione = (nome: string) =>
  readFileSync(`supabase/migrations/${nome}.sql`, "utf8");

export async function setup() {
  const db = new PGlite();
  await db.exec(`
 create schema auth;create role authenticated;create role anon;create role service_role;create type app_role as enum('super_admin');
 create function auth.uid() returns uuid language sql stable as $$select '${u}'::uuid$$;
 create function e_amministratore_di(uuid) returns boolean language sql stable as $$select $1='${c}'::uuid$$;
 create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
 create function utente_bloccato() returns boolean language sql stable as $$select false$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'no')='yes'$$;
 create function user_can_access_company(uuid) returns boolean language sql stable as $$select $1='${c}'::uuid$$;
 -- Come in produzione: 0 a un valore assente o non numerico.
 create function num_da_json(p_valore text) returns numeric language sql immutable as $$
  SELECT CASE WHEN p_valore IS NULL THEN 0 WHEN btrim(p_valore) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(p_valore)::numeric ELSE 0 END $$;
 -- La regola vera, come in produzione.
 create function data_detrazione_iva(p_data_fattura date, p_ricevuta_il timestamptz) returns date language sql stable as $$
  select case
    when p_data_fattura is null or p_ricevuta_il is null then p_data_fattura
    when (p_ricevuta_il at time zone 'Europe/Rome')::date <= p_data_fattura then p_data_fattura
    when date_trunc('month', (p_ricevuta_il at time zone 'Europe/Rome')::date) = date_trunc('month', p_data_fattura) + interval '1 month'
         and extract(day from (p_ricevuta_il at time zone 'Europe/Rome')::date) <= 15
         and extract(year from (p_ricevuta_il at time zone 'Europe/Rome')::date) = extract(year from p_data_fattura)
      then p_data_fattura
    else (p_ricevuta_il at time zone 'Europe/Rome')::date
  end $$;
 create function liquidazione_iva_periodo(uuid,text,integer,integer,integer) returns jsonb language sql stable as $$select '{}'::jsonb$$;
 create table companies(id uuid primary key);insert into companies values('${c}'),('${other}');
 create table f24_entries(id uuid primary key default gen_random_uuid(),company_id uuid,anno integer,mese integer,tributo_code text,tributo_descrizione text,importo numeric,stato text,data_scadenza date,data_pagamento date,note text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(company_id,anno,mese,tributo_code));
 create table ritenute_garanzia(id uuid primary key default gen_random_uuid(),company_id uuid,importo numeric,stato text,data_svincolo_effettiva date,note text,created_at timestamptz default now());
 create table documenti_fiscali(id uuid primary key default gen_random_uuid(),company_id uuid,tipo text default 'fattura',numero text,anno integer,cliente_snapshot jsonb,data_emissione date,imponibile_totale numeric,iva_totale numeric,totale_documento numeric,riepilogo_iva jsonb,esigibilita_iva text,deleted_at timestamptz,stato text,sdi_stato text);
 create table invoices(id uuid primary key default gen_random_uuid(),company_id uuid,invoice_number text,document_type text default 'invoice',external_document_type text,status text default 'sent',external_status text,external_provider text default 'fattureincloud',client_company_name text,client_vat_number text,client_fiscal_code text,issue_date date,subtotal numeric,tax_amount numeric,total numeric,external_tax_summary jsonb,deleted_at timestamptz);
 create table invoice_lines(id uuid primary key default gen_random_uuid(),invoice_id uuid,tax_rate numeric,tax_nature text,line_net numeric,line_tax numeric);
 create table fatture_ricevute(id uuid primary key default gen_random_uuid(),company_id uuid,numero_fattura text,tipo_documento text,cedente_ragione_sociale text,data_fattura date,data_ricezione_sdi timestamptz,imponibile_totale numeric,iva_totale numeric,totale_documento numeric,riepilogo_iva jsonb,righe jsonb,cedente_piva text,aliquota_reverse_charge numeric,stato text);
 grant usage on schema auth,public to authenticated;grant select,insert,update,delete on f24_entries,ritenute_garanzia,documenti_fiscali,fatture_ricevute,invoices,invoice_lines to authenticated;
 `);
  await db.exec(migrazione("20261026220848_fiscalita_conferme_tracciate"));
  await db.exec(migrazione("20281230100000_iva_impostazioni_azienda"));
  await db.exec(migrazione("20281230101000_iva_data_ricezione_dichiarata"));
  await db.exec(migrazione("20281230102000_iva_ricezione_correzioni_caos"));
  await db.exec(migrazione("20281230103000_iva_impostazioni_partita_iva_con_it"));
  await db.exec(migrazione("20281230104000_iva_calcolo_integrazioni_segni_riepiloghi"));
  await db.exec(migrazione("20281230105000_iva_riepilogo_righe_veloce"));
  await db.exec(migrazione("20281230106000_iva_riepilogo_nelle_viste"));
  // In produzione la vista ha già il GRANT (CREATE OR REPLACE lo conserva).
  await db.exec("grant select on fatture_ricevute_periodo_iva, fatture_vendite_iva to authenticated");
  return db;
}

