-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ═══ Audit permessi: i toggle marketing/CRM ora aprono davvero i loro moduli ═
-- Stesso difetto del CRM (fix precedente) su altri moduli: policy staff gated
-- su can_view_orders / can_view_settings / can_view_marketing generico, per cui
-- i permessi granulari (preventivi, appuntamenti, WhatsApp, email marketing,
-- automazioni, simulatore) attivati dall'admin NON aprivano nulla a livello DB.
-- Tutte policy AGGIUNTIVE (le policy RLS si combinano in OR): nessun accesso
-- esistente viene ristretto. has_permission_for_company = permesso verificato
-- sull'azienda della riga, multi-azienda inclusa.

-- Preventivi CRM: il toggle "Preventivi" (can_view/edit_preventivi) ora basta,
-- senza dover dare anche le Commesse.
create policy "q_sel_preventivi" on public.quotes
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_preventivi', company_id)
  and check_staff_visibility((select auth.uid()), assigned_to)
);
create policy "q_upd_preventivi" on public.quotes
for update using (
  has_permission_for_company((select auth.uid()), 'can_edit_preventivi', company_id)
  and check_staff_visibility((select auth.uid()), assigned_to)
) with check (
  has_permission_for_company((select auth.uid()), 'can_edit_preventivi', company_id)
);
create policy "q_ins_preventivi" on public.quotes
for insert with check (
  has_permission_for_company((select auth.uid()), 'can_edit_preventivi', company_id)
);

-- Appuntamenti: chi ha il Calendario CRM (venditori, call center) può vedere
-- e fissare appuntamenti anche senza permessi Commesse/Calendario operativo.
create policy "Staff can view appointments via marketing" on public.appointments
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_appointments', company_id)
  and check_staff_visibility((select auth.uid()), assigned_to)
);
create policy "Staff can manage appointments via marketing" on public.appointments
for all using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_appointments', company_id)
  and check_staff_visibility((select auth.uid()), assigned_to)
) with check (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_appointments', company_id)
);

-- Attività del team: il toggle can_view_team_tasks (pagina Attività) ora vale
-- anche a livello RLS — prima serviva comunque can_view_orders.
create policy "Staff can view team tasks if permitted" on public.tasks
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_team_tasks', company_id)
  and check_staff_visibility((select auth.uid()), assigned_to)
);

-- Lista venditori: serve nei dropdown CRM (assegna venditore a opportunità/
-- preventivo) — prima richiedeva can_view_settings.
create policy "Staff can view salespeople for CRM" on public.salespeople
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_opportunities', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_preventivi', company_id)
);

-- Hub WhatsApp: il toggle can_view_marketing_whatsapp apre le conversazioni
-- (prima serviva can_view_orders).
create policy "Staff can view conversations via whatsapp perm" on public.messaging_conversations
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_whatsapp', company_id)
);
create policy "Staff can view messages via whatsapp perm" on public.messaging_messages
for select using (
  exists (
    select 1 from public.messaging_conversations c
    where c.id = messaging_messages.conversation_id
      and has_permission_for_company((select auth.uid()), 'can_view_marketing_whatsapp', c.company_id)
  )
);
create policy "Staff can view ai runs via whatsapp perm" on public.messaging_ai_runs
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_whatsapp', company_id)
);
create policy "Staff can view daily reports via whatsapp perm" on public.messaging_daily_reports
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_whatsapp', company_id)
);

-- Simulatore ROI CRM: gated dai permessi opportunità, non dalle commesse.
create policy "Staff can view roi simulations via crm perm" on public.crm_roi_simulations
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_opportunities', company_id)
);

-- Email marketing: il toggle can_view_marketing_email apre campagne/template/
-- log (prima serviva il generico can_view_marketing).
create policy "Staff can view campaigns via email perm" on public.email_campaigns
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_email', company_id)
);
create policy "Staff can view templates via email perm" on public.email_templates
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_email', company_id)
);
create policy "Staff can view logs via email perm" on public.email_logs
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_email', company_id)
);
create policy "Staff can view folders via email perm" on public.email_folders
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_marketing_email', company_id)
);

-- Automazioni: i toggle can_view_automazioni / can_view_marketing_automations
-- aprono i flussi (prima serviva il generico can_view_marketing).
create policy "Staff can view flows via automation perm" on public.automation_flows
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_automazioni', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_marketing_automations', company_id)
);
create policy "Staff can view nodes via automation perm" on public.automation_nodes
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_automazioni', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_marketing_automations', company_id)
);
create policy "Staff can view connections via automation perm" on public.automation_connections
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_automazioni', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_marketing_automations', company_id)
);
create policy "Staff can view enrollments via automation perm" on public.automation_enrollments
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_automazioni', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_marketing_automations', company_id)
);
create policy "Staff can view execution log via automation perm" on public.automation_execution_log
for select using (
  has_permission_for_company((select auth.uid()), 'can_view_automazioni', company_id)
  or has_permission_for_company((select auth.uid()), 'can_view_marketing_automations', company_id)
);
