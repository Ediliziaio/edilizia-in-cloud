-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-05 · Playbook cross-modulo (le ricette di Silvio)
-- Procedimenti multi-step DETERMINISTICI composti SOLO da azioni del registro
-- (MP-SILVIO-01). Un playbook avviato vive come task (MP-SILVIO-04). Rami di
-- sicurezza (IBAN diverso, scostamento) → conferma, mai automatici.
-- ════════════════════════════════════════════════════════════════════════════

-- azione mancante usata dai playbook (notifica nel digest) — additiva al catalogo
INSERT INTO public.silvio_azioni (chiave, descrizione, modulo, funzione_target, input_schema, reversibilita, categoria_rischio, autorizzazione, ruoli_consentiti) VALUES
 ('notifica_digest','Aggiunge una nota/alert nel digest giornaliero','email','digest_log','{"testo":"text"}','reversibile','interno','autonoma','{company_admin,company_staff,employee}')
ON CONFLICT (chiave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.silvio_playbook (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES public.companies(id) ON DELETE CASCADE,  -- NULL = default globale
  chiave      text NOT NULL,
  nome        text NOT NULL,
  innesco     text NOT NULL,                 -- evento che lo avvia
  passi       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ordine, azione_chiave?, condizione?, ramo?, nota?}]
  attivo      boolean NOT NULL DEFAULT true,
  versione    int NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chiave)
);
CREATE INDEX IF NOT EXISTS idx_silvio_playbook_innesco ON public.silvio_playbook (innesco) WHERE attivo;

-- 4 playbook globali (company_id NULL): solo azioni del registro + nodi-condizione di sicurezza
INSERT INTO public.silvio_playbook (company_id, chiave, nome, innesco, passi) VALUES
 (NULL, 'fattura_passiva', 'Fattura passiva in arrivo', 'email_allegato_fattura', $$[
   {"ordine":1,"azione_chiave":"crea_bozza_fattura_passiva","nota":"estrai dati e crea la bozza"},
   {"ordine":2,"condizione":"iban_diverso_dal_solito","ramo":"ferma_e_allerta","nota":"sicurezza antifrode: conferma manuale"},
   {"ordine":3,"azione_chiave":"aggiungi_scadenza_previsionale","nota":"scadenza nel cashflow"},
   {"ordine":4,"azione_chiave":"collega_email_entita","condizione":"cantiere_citato"},
   {"ordine":5,"azione_chiave":"notifica_digest"}
 ]$$::jsonb),
 (NULL, 'richiesta_preventivo', 'Richiesta di preventivo', 'email_categoria_preventivo', $$[
   {"ordine":1,"azione_chiave":"apri_opportunita_preventivo"},
   {"ordine":2,"azione_chiave":"genera_bozza_risposta","nota":"ricevuto, ti rispondo entro..."},
   {"ordine":3,"azione_chiave":"attiva_sequenza_followup","nota":"follow-up tra N giorni"}
 ]$$::jsonb),
 (NULL, 'ddt_in_arrivo', 'Bolla / DDT in arrivo', 'email_categoria_ddt', $$[
   {"ordine":1,"azione_chiave":"crea_bozza_carico_magazzino","nota":"estrai e confronta con l'ordine"},
   {"ordine":2,"condizione":"scostamento_ddt","ramo":"evidenzia_e_chiedi_verifica","nota":"sicurezza: conferma manuale"},
   {"ordine":3,"azione_chiave":"collega_email_entita","condizione":"cantiere_collegato"},
   {"ordine":4,"azione_chiave":"notifica_digest"}
 ]$$::jsonb),
 (NULL, 'sollecito_pagamento', 'Sollecito di pagamento ricevuto', 'email_categoria_sollecito', $$[
   {"ordine":1,"azione_chiave":"collega_email_entita","nota":"collega alla fattura"},
   {"ordine":2,"azione_chiave":"genera_bozza_risposta"},
   {"ordine":3,"azione_chiave":"notifica_digest","nota":"alert immediato all'utente"}
 ]$$::jsonb)
ON CONFLICT (company_id, chiave) DO NOTHING;

ALTER TABLE public.silvio_playbook ENABLE ROW LEVEL SECURITY;
-- lettura: default globali (company_id NULL) + quelli della propria azienda
DROP POLICY IF EXISTS silvio_playbook_read ON public.silvio_playbook;
CREATE POLICY silvio_playbook_read ON public.silvio_playbook FOR SELECT TO authenticated
  USING (company_id IS NULL OR (company_id = public.get_effective_company_id() AND public.is_email_staff_interno()));
-- scrittura azienda: solo i propri (staff)
DROP POLICY IF EXISTS silvio_playbook_write ON public.silvio_playbook;
CREATE POLICY silvio_playbook_write ON public.silvio_playbook FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_playbook_service ON public.silvio_playbook;
CREATE POLICY silvio_playbook_service ON public.silvio_playbook FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_playbook_super ON public.silvio_playbook;
CREATE POLICY silvio_playbook_super ON public.silvio_playbook FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.silvio_playbook IS 'MP-SILVIO-05: ricette multi-step (solo azioni del registro). company_id NULL = default globale. L''avvio crea un silvio_task.';
