-- ============================================================================
-- v8.6.88 — Email Lifecycle Automation: seed templates + tracking + cron
--
-- Seed dei 5 template lifecycle in platform_email_templates con default HTML
-- editabile dal pannello super-admin.
-- + tabella lifecycle_email_sends per audit/idempotenza (no doppi invii)
-- + pg_cron giornaliero che chiama l'edge function lifecycle-email-tick
-- ============================================================================

-- ─── 1. Tabella tracking invii (idempotenza) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifecycle_email_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key  TEXT NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_to      TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sent','failed','suppressed','skipped')),
  metadata      JSONB
);

-- 1 invio per (company, template) tipicamente; per monthly_summary aggiungiamo
-- anche month_key in metadata e indice composito esteso.
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_sends_lookup
  ON public.lifecycle_email_sends (company_id, template_key, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_lifecycle_email_sends_recent
  ON public.lifecycle_email_sends (template_key, sent_at DESC);

ALTER TABLE public.lifecycle_email_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_lifecycle_email_sends" ON public.lifecycle_email_sends;
CREATE POLICY "sa_lifecycle_email_sends" ON public.lifecycle_email_sends
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ─── 2. Seed default templates ──────────────────────────────────────────────
-- HTML semplice & professional. Super-admin può modificare via UI.

INSERT INTO public.platform_email_templates
  (template_key, role_variant, subject, html_body, enabled, notes)
VALUES
  (
    'lifecycle_d3_no_activation', NULL,
    'Ciao {{recipientName}}, ti aiutiamo a partire?',
    '<h2 style="color:#173b67;margin:0 0 16px">Sei a {{completedSteps}} dal completamento</h2>
<p>Ciao {{recipientName}},</p>
<p>Hai creato l''account di <strong>{{companyName}}</strong> qualche giorno fa ma noto che il setup non è ancora completo.</p>
<p>Sono qui per aiutarti: in 5 minuti puoi essere operativo. Ti basta:</p>
<ul>
  <li>Aggiungere il primo cliente</li>
  <li>Creare la prima commessa</li>
  <li>Invitare il tuo team</li>
</ul>
<p style="margin-top:24px"><a href="{{loginUrl}}" style="background:#E8521A;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Riprendi il setup →</a></p>
<p style="margin-top:32px;color:#666;font-size:13px">Hai bisogno di aiuto? Rispondi a questa email, ti rispondo personalmente.</p>',
    true,
    'Default v8.6.88 — Modificami per personalizzare il tone of voice'
  ),
  (
    'lifecycle_d7_features', NULL,
    '{{recipientName}}, ecco 3 superpoteri di EiC che forse non conosci',
    '<h2 style="color:#173b67;margin:0 0 16px">3 cose che ti faranno guadagnare ore</h2>
<p>Ciao {{recipientName}},</p>
<p>Una settimana fa hai iniziato a usare Edilizia in Cloud. Voglio mostrarti 3 funzioni che usano gli imprenditori più veloci:</p>
<ol>
  <li><strong>Render AI</strong> — Foto del cantiere → render fotorealistico in 90 secondi. Chiude più trattative.</li>
  <li><strong>AI Preventivo</strong> — Descrivi a voce o testo il lavoro → preventivo strutturato pronto in 2 minuti.</li>
  <li><strong>Automazioni</strong> — Setup 1 volta, lavora per te per sempre (es. auto-fattura a fine cantiere).</li>
</ol>
<p style="margin-top:24px"><a href="{{tutorialUrl}}" style="background:#E8521A;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Guarda i video (2 min) →</a></p>',
    true,
    'Default v8.6.88'
  ),
  (
    'lifecycle_trial_ending', NULL,
    '⏰ Il tuo trial scade tra {{daysRemaining}} giorni',
    '<h2 style="color:#173b67;margin:0 0 16px">Manca poco {{recipientName}}</h2>
<p>Il tuo periodo di prova scade tra <strong>{{daysRemaining}} giorni</strong>. Vediamo cosa hai fatto fin qui:</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:12px;background:#f3f4f6;border-radius:8px"><strong>{{ordersCount}}</strong><br><span style="color:#666;font-size:13px">Commesse create</span></td></tr>
  <tr><td style="padding:12px;background:#f3f4f6;border-radius:8px;margin-top:8px"><strong>{{customersCount}}</strong><br><span style="color:#666;font-size:13px">Clienti gestiti</span></td></tr>
</table>
<p>Non perdere questi dati. Attiva un piano e continua senza interruzioni.</p>
<p style="margin-top:24px"><a href="{{upgradeUrl}}" style="background:#E8521A;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Attiva un piano →</a></p>
<p style="margin-top:16px;font-size:13px;color:#666">Domande? Rispondi a questa email.</p>',
    true,
    'Default v8.6.88'
  ),
  (
    'lifecycle_monthly_summary', NULL,
    '📊 Il tuo mese su EiC · {{monthName}}',
    '<h2 style="color:#173b67;margin:0 0 16px">Riepilogo {{monthName}}</h2>
<p>Ciao {{recipientName}}, ecco cosa è successo questo mese su Edilizia in Cloud:</p>
<table style="width:100%;border-collapse:separate;border-spacing:0 8px;margin:16px 0">
  <tr><td style="padding:14px 16px;background:#f0fdf4;border-left:3px solid #22c55e;border-radius:6px"><strong style="font-size:22px;color:#15803d">{{ordersCount}}</strong><br><span style="color:#666;font-size:13px">Commesse gestite</span></td></tr>
  <tr><td style="padding:14px 16px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:6px"><strong style="font-size:22px;color:#1d4ed8">{{revenueFormatted}}</strong><br><span style="color:#666;font-size:13px">Fatturato del mese</span></td></tr>
  <tr><td style="padding:14px 16px;background:#fff7ed;border-left:3px solid #f97316;border-radius:6px"><strong style="font-size:22px;color:#c2410c">~{{hoursSaved}} ore</strong><br><span style="color:#666;font-size:13px">Risparmiate vs Excel/carta</span></td></tr>
</table>
<p style="margin-top:24px"><a href="{{dashboardUrl}}" style="background:#173b67;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Apri dashboard →</a></p>',
    true,
    'Default v8.6.88'
  ),
  (
    'lifecycle_payment_failed', NULL,
    '⚠️ Pagamento non riuscito · Aggiorna i dati in 1 minuto',
    '<h2 style="color:#b91c1c;margin:0 0 16px">Pagamento non riuscito</h2>
<p>Ciao {{recipientName}},</p>
<p>Non siamo riusciti ad addebitare <strong>{{amountFormatted}}</strong> per l''abbonamento di <strong>{{companyName}}</strong> (tentativo {{attemptNumber}}).</p>
<p>Per evitare la sospensione dell''account, aggiorna il metodo di pagamento:</p>
<p style="margin-top:24px"><a href="{{portalUrl}}" style="background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600">Aggiorna pagamento →</a></p>
<p style="margin-top:16px;color:#666;font-size:13px">Riproveremo automaticamente nei prossimi giorni. Se hai bisogno di aiuto rispondi a questa email.</p>',
    true,
    'Default v8.6.88'
  )
ON CONFLICT (template_key, role_variant) DO NOTHING;

-- ─── 3. pg_cron job giornaliero ─────────────────────────────────────────────
-- Ogni giorno alle 08:30 UTC (10:30 IT estate / 09:30 IT inverno) chiama
-- l'edge function lifecycle-email-tick che decide chi mandare quale email.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lifecycle_email_daily';

    PERFORM cron.schedule(
      'lifecycle_email_daily',
      '30 8 * * *',
      $cron$
        SELECT net.http_post(
          url := (SELECT value FROM public.platform_settings WHERE key = 'supabase_url' LIMIT 1) || '/functions/v1/lifecycle-email-tick',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT value FROM public.platform_settings WHERE key = 'supabase_service_role_key' LIMIT 1)
          ),
          body := '{}'::jsonb
        ) AS request_id;
      $cron$
    );
  END IF;
END $$;
