-- Quarta natura di ostacolo alla purga (vedi …008): FK LASCIATE AL DEFAULT.
--
-- Sedici riferimenti a `companies` erano a NO ACTION, cioe' "blocca": nessun
-- cascade li rimuove, e la cancellazione dell'azienda si ferma li'. Quattro
-- avevano righe vere (billing_sync_log 159, warehouse_movements 124,
-- warehouse_stock 102, invoice_payments 2), gli altri dodici erano bombe a
-- orologeria in attesa della prima riga.
--
-- Regola, la stessa di `admin_tabelle_da_esportare()`: una riga con
-- `company_id` APPARTIENE a quell'azienda, quindi CASCADE. L'unica eccezione
-- e' `referral_clicks.converted_company_id`, che e' un puntatore e non un
-- possesso: il click resta a chi l'ha generato, perde la conversione.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.ai_agent_tests              DROP CONSTRAINT IF EXISTS ai_agent_tests_company_id_fkey;
ALTER TABLE public.ai_agent_tests              ADD  CONSTRAINT ai_agent_tests_company_id_fkey              FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.ai_credit_topups            DROP CONSTRAINT IF EXISTS ai_credit_topups_company_id_fkey;
ALTER TABLE public.ai_credit_topups            ADD  CONSTRAINT ai_credit_topups_company_id_fkey            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.ai_credit_usage             DROP CONSTRAINT IF EXISTS ai_credit_usage_company_id_fkey;
ALTER TABLE public.ai_credit_usage             ADD  CONSTRAINT ai_credit_usage_company_id_fkey             FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.automation_flow_versions    DROP CONSTRAINT IF EXISTS automation_flow_versions_company_id_fkey;
ALTER TABLE public.automation_flow_versions    ADD  CONSTRAINT automation_flow_versions_company_id_fkey    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.billing_sync_log            DROP CONSTRAINT IF EXISTS billing_sync_log_company_id_fkey;
ALTER TABLE public.billing_sync_log            ADD  CONSTRAINT billing_sync_log_company_id_fkey            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.goods_receipts              DROP CONSTRAINT IF EXISTS goods_receipts_company_id_fkey;
ALTER TABLE public.goods_receipts              ADD  CONSTRAINT goods_receipts_company_id_fkey              FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.installations               DROP CONSTRAINT IF EXISTS installations_company_id_fkey;
ALTER TABLE public.installations               ADD  CONSTRAINT installations_company_id_fkey               FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_payments            DROP CONSTRAINT IF EXISTS invoice_payments_company_id_fkey;
ALTER TABLE public.invoice_payments            ADD  CONSTRAINT invoice_payments_company_id_fkey            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.marketing_opportunity_notes DROP CONSTRAINT IF EXISTS marketing_opportunity_notes_company_id_fkey;
ALTER TABLE public.marketing_opportunity_notes ADD  CONSTRAINT marketing_opportunity_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.order_item_timeline         DROP CONSTRAINT IF EXISTS order_item_timeline_company_id_fkey;
ALTER TABLE public.order_item_timeline         ADD  CONSTRAINT order_item_timeline_company_id_fkey         FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.shipments_to_site           DROP CONSTRAINT IF EXISTS shipments_to_site_company_id_fkey;
ALTER TABLE public.shipments_to_site           ADD  CONSTRAINT shipments_to_site_company_id_fkey           FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.site_deliveries             DROP CONSTRAINT IF EXISTS site_deliveries_company_id_fkey;
ALTER TABLE public.site_deliveries             ADD  CONSTRAINT site_deliveries_company_id_fkey             FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.support_messages            DROP CONSTRAINT IF EXISTS support_messages_company_id_fkey;
ALTER TABLE public.support_messages            ADD  CONSTRAINT support_messages_company_id_fkey            FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_movements         DROP CONSTRAINT IF EXISTS warehouse_movements_company_id_fkey;
ALTER TABLE public.warehouse_movements         ADD  CONSTRAINT warehouse_movements_company_id_fkey         FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_stock             DROP CONSTRAINT IF EXISTS warehouse_stock_company_id_fkey;
ALTER TABLE public.warehouse_stock             ADD  CONSTRAINT warehouse_stock_company_id_fkey             FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.referral_clicks             DROP CONSTRAINT IF EXISTS referral_clicks_converted_company_id_fkey;
ALTER TABLE public.referral_clicks             ADD  CONSTRAINT referral_clicks_converted_company_id_fkey   FOREIGN KEY (converted_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
