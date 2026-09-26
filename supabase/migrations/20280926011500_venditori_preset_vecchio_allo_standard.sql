-- Venditori nati col preset vecchio: allo standard di Marketing & Vendita.
--
-- Fino al 25/09/2026 il preset del venditore apriva anche la dashboard
-- generale, le commesse, il calendario lavori, i clienti, l'elenco utenti e
-- l'hub delle firme. Florin: il venditore, di serie, vede solo Marketing &
-- Vendita. I preset sono corretti nel codice (client e server); qui si
-- spengono quelle sei voci a chi le ha ancora tutte e sei SOLO perché era il
-- preset: venditori che, oltre alla vendita, non hanno ricevuto altro.
--
-- Chi dall'amministratore ha avuto anche impostazioni, magazzino, costi,
-- personale o altro resta com'è: è stato configurato apposta, e togliergli
-- le commesse sarebbe un danno. Restano com'erano anche le aziende che hanno
-- scelto per i loro venditori una sola voce in più (per esempio il solo
-- calendario lavori).
--
-- Le righe di prima restano in _audit_pre_migration_snapshots
-- (migration_label 'venditori_preset_vecchio_allo_standard') per tornare
-- indietro. Rilanciata non trova più nessuno.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

with bersaglio as (
  select sp.user_id, sp.company_id
    from public.staff_permissions sp
   where exists (select 1 from public.user_roles r
                  where r.user_id = sp.user_id and r.role = 'salesperson')
     and not exists (select 1 from public.user_roles r
                      where r.user_id = sp.user_id and r.role in ('company_admin', 'super_admin'))
     -- le sei voci del preset vecchio, tutte accese
     and sp.can_view_dashboard and sp.can_view_orders and sp.can_view_calendar
     and sp.can_view_customers and sp.can_view_users and sp.can_view_firma_elettronica
     -- e nient'altro fuori da quel preset e dalla vendita
     and not exists (
       select 1 from jsonb_each(to_jsonb(sp)) k
        where jsonb_typeof(k.value) = 'boolean' and k.value = 'true'::jsonb
          and k.key not in (
            -- il preset vecchio
            'can_view_dashboard', 'can_view_orders', 'can_view_calendar', 'can_view_customers',
            'can_view_users', 'can_view_firma_elettronica', 'can_view_formazione',
            'can_view_marketing_dashboard', 'can_view_marketing_contacts',
            'can_view_marketing_opportunities', 'can_view_preventivi', 'can_view_sopralluoghi',
            'can_view_marketing_activities', 'can_view_marketing_appointments',
            'can_view_marketing_reports', 'can_view_reputazione', 'can_view_sales_os',
            'can_view_marketing', 'can_view_order_amounts',
            -- le modifiche che il trigger deriva dalla visibilità
            'can_edit_orders', 'can_edit_customers', 'can_edit_marketing_contacts',
            'can_edit_marketing_opportunities', 'can_edit_preventivi', 'can_edit_marketing',
            -- aggiunte di vendita
            'can_approve_discounts', 'can_view_marketing_email', 'can_view_marketing_whatsapp',
            'can_view_sms_marketing', 'can_view_marketing_automations', 'can_view_automazioni',
            'can_view_marketing_ai_agent', 'can_view_render_ai',
            -- restrizioni e stato, non aperture
            'only_assigned', 'only_my_warehouse', 'sola_lettura', 'must_change_password'
          )
     )
),
copia as (
  insert into public._audit_pre_migration_snapshots (migration_label, table_name, row_count, sample_rows)
  select 'venditori_preset_vecchio_allo_standard', 'staff_permissions', count(*), jsonb_agg(to_jsonb(sp))
    from public.staff_permissions sp
    join bersaglio b on b.user_id = sp.user_id and b.company_id = sp.company_id
  having count(*) > 0
)
update public.staff_permissions sp
   set can_view_dashboard = false,
       can_view_orders = false,
       can_view_calendar = false,
       can_view_customers = false,
       can_view_users = false,
       can_view_firma_elettronica = false
  from bersaglio b
 where b.user_id = sp.user_id and b.company_id = sp.company_id;
