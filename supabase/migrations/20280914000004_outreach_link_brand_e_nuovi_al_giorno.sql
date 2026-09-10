-- Outreach a freddo: tre cose che mancavano perché la posta non finisse in spam,
-- valide per qualunque brand (10/09/2026, audit sul pool «Agenzia Infissi»).
--
-- 1. I link di tracciamento e disiscrizione uscivano su
--    rsbrguhkodgnqfomrevo.supabase.co — un dominio estraneo al mittente, in
--    ogni email, anche nell'intestazione List-Unsubscribe. Ogni brand può ora
--    avere il suo dominio per i link (es. https://link.thermodmr.it/l), servito
--    dal proxy Pages `functions/l/[[path]].js`.
--
-- 2. Il tetto giornaliero contava insieme primi contatti e follow-up: con 5
--    nuovi al giorno e sei follow-up, a regime una casella ne spedisce 35, non
--    5. `new_per_day` è il tetto dei SOLI primi contatti per casella; i
--    follow-up restano dentro il tetto totale.
--
-- 3. Per distinguerli serve sapere quale riga in coda è un primo contatto:
--    `primo_contatto` lo scrive chi accoda (iscrizione → true, follow-up → false).

ALTER TABLE public.outreach_brands
  ADD COLUMN IF NOT EXISTS tracking_base_url text,
  ADD COLUMN IF NOT EXISTS new_per_day integer;

COMMENT ON COLUMN public.outreach_brands.tracking_base_url IS
  'Base dei link di tracciamento/disiscrizione del brand (es. https://link.dominio.it/l). Vuoto = impostazione di piattaforma outreach_tracking_base_url.';
COMMENT ON COLUMN public.outreach_brands.new_per_day IS
  'Tetto di PRIMI contatti al giorno per casella. Vuoto = nessun tetto separato (vale solo il tetto totale).';

ALTER TABLE public.outreach_send_queue
  ADD COLUMN IF NOT EXISTS primo_contatto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.outreach_send_queue.primo_contatto IS
  'true = primo touch della sequenza (conta nel tetto new_per_day del brand).';

-- Le righe già in coda create dall''iscrizione (senza follow-up precedenti) sono
-- primi contatti: si riconoscono perché la loro iscrizione non ha ancora
-- spedito niente. Solo le righe in attesa: quelle spedite non cambiano nulla.
UPDATE public.outreach_send_queue q
   SET primo_contatto = true
 WHERE q.status = 'queued'
   AND q.channel = 'email'
   AND NOT EXISTS (
     SELECT 1 FROM public.outreach_send_queue s
      WHERE s.enrollment_id = q.enrollment_id AND s.status = 'sent'
   );

-- Indice per il conteggio «primi contatti spediti oggi per casella».
CREATE INDEX IF NOT EXISTS outreach_send_queue_primi_oggi_idx
  ON public.outreach_send_queue (sender_account_id, sent_at)
  WHERE primo_contatto AND status = 'sent';
