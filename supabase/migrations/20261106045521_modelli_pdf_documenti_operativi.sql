create table public.company_document_templates (
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null check (document_type in ('materiali','richiesta','servizi','trasporti','economia','rapportino','fine_lavori')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object' and octet_length(config::text) <= 16000),
  updated_at timestamptz not null default now(),
  primary key (company_id, document_type)
);
alter table public.company_document_templates enable row level security;
revoke all on public.company_document_templates from anon, authenticated;
grant select, insert, update on public.company_document_templates to authenticated;
grant all on public.company_document_templates to service_role;
create policy document_templates_read on public.company_document_templates for select to authenticated using (
  (company_id=(select public.get_user_company_id(auth.uid())) or (select public.has_role(auth.uid(),'super_admin'::public.app_role)))
  and not (select public.utente_e_cliente_esterno()) and not (select public.utente_bloccato())
);
create policy document_templates_insert on public.company_document_templates for insert to authenticated with check (
  (company_id=(select public.get_user_company_id(auth.uid())) or (select public.has_role(auth.uid(),'super_admin'::public.app_role)))
  and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_orders')))
  and not (select public.utente_e_cliente_esterno()) and not (select public.utente_bloccato())
);
create policy document_templates_update on public.company_document_templates for update to authenticated using (
  (company_id=(select public.get_user_company_id(auth.uid())) or (select public.has_role(auth.uid(),'super_admin'::public.app_role)))
  and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_orders')))
  and not (select public.utente_e_cliente_esterno()) and not (select public.utente_bloccato())
) with check (
  (company_id=(select public.get_user_company_id(auth.uid())) or (select public.has_role(auth.uid(),'super_admin'::public.app_role)))
  and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_orders')))
  and not (select public.utente_e_cliente_esterno()) and not (select public.utente_bloccato())
);
comment on table public.company_document_templates is 'Personalizzazioni dei modelli PDF operativi per azienda. Nessuna modifica retroattiva ai PDF già emessi.';
