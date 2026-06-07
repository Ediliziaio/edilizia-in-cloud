-- ════════════════════════════════════════════════════════════════════════════
-- Procurement — Supplier Bridge
-- ----------------------------------------------------------------------------
-- Collega le proposte d'ordine (proposed_purchase_orders, sistema MP-OPS-05 già
-- esistente) all'INVIO dell'ODA al fornitore via Gmail ufficiale (email_outbox)
-- e alla RISPOSTA del fornitore (email_inbox), così da chiudere il loop
-- operativo SENZA AI sul threading (matching deterministico via Message-ID /
-- In-Reply-To gestito in codice).
--
-- NESSUNA tabella nuova: si riusa proposed_purchase_orders e i suoi stati
-- (draft → approved → sent_to_supplier → confirmed → delivered → rejected).
--
-- Nuove colonne:
--   email_outbox_id      → l'email d'ordine inviata (ancora di threading)
--   reply_inbox_id       → la risposta del fornitore correlata
--   next_step_proposal   → proposta AI (lettura risposta) in attesa del gate umano
--   sent_to_supplier_at  → quando l'ODA è stata effettivamente inviata
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.proposed_purchase_orders
  ADD COLUMN IF NOT EXISTS email_outbox_id     uuid REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_inbox_id      uuid REFERENCES public.email_inbox(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_step_proposal  jsonb,
  ADD COLUMN IF NOT EXISTS sent_to_supplier_at timestamptz;

-- Indice per ritrovare velocemente la proposta a partire dall'email d'ordine
-- inviata (matching deterministico risposta ↔ ODA via threading).
CREATE INDEX IF NOT EXISTS idx_ppo_email_outbox
  ON public.proposed_purchase_orders(email_outbox_id)
  WHERE email_outbox_id IS NOT NULL;

COMMENT ON COLUMN public.proposed_purchase_orders.email_outbox_id IS
  'FK email_outbox: ODA inviata al fornitore via Gmail ufficiale (per threading Message-ID/In-Reply-To).';
COMMENT ON COLUMN public.proposed_purchase_orders.reply_inbox_id IS
  'FK email_inbox: risposta del fornitore correlata in modo deterministico (no AID).';
COMMENT ON COLUMN public.proposed_purchase_orders.next_step_proposal IS
  'Proposta AI (lettura risposta fornitore) in attesa del gate di conferma umano (Gate 2).';
COMMENT ON COLUMN public.proposed_purchase_orders.sent_to_supplier_at IS
  'Timestamp dell''invio effettivo dell''ODA al fornitore.';
