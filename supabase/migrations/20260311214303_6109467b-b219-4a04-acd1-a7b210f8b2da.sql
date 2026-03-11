
-- Fix FK constraints: NO ACTION → ON DELETE SET NULL for user/contact deletion integrity

-- === FKs referencing auth.users (profiles.id) that block user deletion ===

-- referrers.user_id
ALTER TABLE public.referrers DROP CONSTRAINT IF EXISTS referrers_user_id_fkey;
ALTER TABLE public.referrers ADD CONSTRAINT referrers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- marketing_contacts.call_center_id
ALTER TABLE public.marketing_contacts DROP CONSTRAINT IF EXISTS marketing_contacts_call_center_id_fkey;
ALTER TABLE public.marketing_contacts ADD CONSTRAINT marketing_contacts_call_center_id_fkey FOREIGN KEY (call_center_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- marketing_opportunities.call_center_id
ALTER TABLE public.marketing_opportunities DROP CONSTRAINT IF EXISTS marketing_opportunities_call_center_id_fkey;
ALTER TABLE public.marketing_opportunities ADD CONSTRAINT marketing_opportunities_call_center_id_fkey FOREIGN KEY (call_center_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- orders.assigned_to
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_assigned_to_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

-- tasks.assigned_to
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

-- invoices.created_by
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- invoice_payments.created_by
ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_created_by_fkey;
ALTER TABLE public.invoice_payments ADD CONSTRAINT invoice_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- signature_requests.created_by
ALTER TABLE public.signature_requests DROP CONSTRAINT IF EXISTS signature_requests_created_by_fkey;
ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- marketing_contact_notes.created_by
ALTER TABLE public.marketing_contact_notes DROP CONSTRAINT IF EXISTS marketing_contact_notes_created_by_fkey;
ALTER TABLE public.marketing_contact_notes ADD CONSTRAINT marketing_contact_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- marketing_contact_activities.created_by
ALTER TABLE public.marketing_contact_activities DROP CONSTRAINT IF EXISTS marketing_contact_activities_created_by_fkey;
ALTER TABLE public.marketing_contact_activities ADD CONSTRAINT marketing_contact_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- work_logs.approved_by
ALTER TABLE public.work_logs DROP CONSTRAINT IF EXISTS work_logs_approved_by_fkey;
ALTER TABLE public.work_logs ADD CONSTRAINT work_logs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- scadenze.created_by
ALTER TABLE public.scadenze DROP CONSTRAINT IF EXISTS scadenze_created_by_fkey;
ALTER TABLE public.scadenze ADD CONSTRAINT scadenze_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- prima_nota_entries.created_by
ALTER TABLE public.prima_nota_entries DROP CONSTRAINT IF EXISTS prima_nota_entries_created_by_fkey;
ALTER TABLE public.prima_nota_entries ADD CONSTRAINT prima_nota_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- purchase_orders.created_by
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_created_by_fkey;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- bank_connections.created_by
ALTER TABLE public.bank_connections DROP CONSTRAINT IF EXISTS bank_connections_created_by_fkey;
ALTER TABLE public.bank_connections ADD CONSTRAINT bank_connections_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- bank_sync_logs.triggered_by
ALTER TABLE public.bank_sync_logs DROP CONSTRAINT IF EXISTS bank_sync_logs_triggered_by_fkey;
ALTER TABLE public.bank_sync_logs ADD CONSTRAINT bank_sync_logs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- platform_announcements.created_by
ALTER TABLE public.platform_announcements DROP CONSTRAINT IF EXISTS platform_announcements_created_by_fkey;
ALTER TABLE public.platform_announcements ADD CONSTRAINT platform_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- platform_settings.updated_by
ALTER TABLE public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_updated_by_fkey;
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- companies.white_label_enabled_by
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_white_label_enabled_by_fkey;
ALTER TABLE public.companies ADD CONSTRAINT companies_white_label_enabled_by_fkey FOREIGN KEY (white_label_enabled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- company_addons_log.performed_by
ALTER TABLE public.company_addons_log DROP CONSTRAINT IF EXISTS company_addons_log_performed_by_fkey;
ALTER TABLE public.company_addons_log ADD CONSTRAINT company_addons_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- company_onboarding.assigned_cs
ALTER TABLE public.company_onboarding DROP CONSTRAINT IF EXISTS company_onboarding_assigned_cs_fkey;
ALTER TABLE public.company_onboarding ADD CONSTRAINT company_onboarding_assigned_cs_fkey FOREIGN KEY (assigned_cs) REFERENCES auth.users(id) ON DELETE SET NULL;

-- cs_tasks.assigned_to
ALTER TABLE public.cs_tasks DROP CONSTRAINT IF EXISTS cs_tasks_assigned_to_fkey;
ALTER TABLE public.cs_tasks ADD CONSTRAINT cs_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

-- inventory_audits.performed_by
ALTER TABLE public.inventory_audits DROP CONSTRAINT IF EXISTS inventory_audits_performed_by_fkey;
ALTER TABLE public.inventory_audits ADD CONSTRAINT inventory_audits_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- user_sessions.revoked_by
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_revoked_by_fkey;
ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- multi_company_access.granted_by
ALTER TABLE public.multi_company_access DROP CONSTRAINT IF EXISTS multi_company_access_granted_by_fkey;
ALTER TABLE public.multi_company_access ADD CONSTRAINT multi_company_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- === FKs referencing marketing_contacts that block contact deletion ===

-- internal_call_logs.contact_id
ALTER TABLE public.internal_call_logs DROP CONSTRAINT IF EXISTS internal_call_logs_contact_id_fkey;
ALTER TABLE public.internal_call_logs ADD CONSTRAINT internal_call_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.marketing_contacts(id) ON DELETE SET NULL;

-- invoices.client_id
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_client_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.marketing_contacts(id) ON DELETE SET NULL;
