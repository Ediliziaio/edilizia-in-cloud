import { readFileSync } from 'node:fs';
export const workCopyMigration=readFileSync('supabase/migrations/20261015194329_duplicazione_lavori_struttura_e_preventivi.sql','utf8');
export const workCopySchema=`
alter table orders add client_company text,add client_address text,add deleted_at timestamptz,add quote_id uuid,add updated_at timestamptz default now();
alter table order_items add phase_id uuid;
alter table order_work_phases add status text default 'da_iniziare',add percentuale numeric default 0,
 add start_date date,add end_date date,add foto_urls jsonb,add completata_da uuid,add completata_il date;
create table order_work_subphases(id uuid primary key default gen_random_uuid(),phase_id uuid,name text,position integer,peso integer,fatta boolean default false,fatta_il timestamptz,fatta_da uuid);
alter table rst_progetti add deleted_at timestamptz,add created_at timestamptz default now(),add updated_at timestamptz default now(),add updated_by uuid,
 add opportunita_id uuid,add origine_quote_id uuid,add origine_quote_revision integer,add origine_quote_impronta text,add origine_modello_impronta text,
 add sconto_pct numeric,add template_id uuid,add modello_snapshot jsonb,add esigenze jsonb;
alter table rst_computo_voci add company_id uuid,add created_at timestamptz default now(),add immagine_url text,add descrizione_estesa text;
alter table staff_permissions add can_view_orders boolean default false,add can_edit_preventivi boolean default false;
create function can_see_order(o uuid,u uuid,w uuid) returns boolean language sql stable as $$select current_setting('test.assigned',true) is distinct from 'true' or u=auth.uid()$$;
`;
