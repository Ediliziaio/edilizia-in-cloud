-- Estende fv_template_pdf con impostazioni commerciali e blocchi di conversione
-- per il preventivatore Fotovoltaico.

ALTER TABLE public.fv_template_pdf
  ADD COLUMN IF NOT EXISTS valore_proposta_html text,
  ADD COLUMN IF NOT EXISTS garanzie_conversione jsonb,
  ADD COLUMN IF NOT EXISTS faq_items jsonb,
  ADD COLUMN IF NOT EXISTS condizioni_legali_attivo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS condizioni_legali_testo text,
  ADD COLUMN IF NOT EXISTS urgenza_attiva boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgenza_titolo text,
  ADD COLUMN IF NOT EXISTS urgenza_descrizione text,
  ADD COLUMN IF NOT EXISTS margine_target_pct numeric DEFAULT 0.35,
  ADD COLUMN IF NOT EXISTS costo_kwp_base numeric,
  ADD COLUMN IF NOT EXISTS costo_accumulo_kwh numeric,
  ADD COLUMN IF NOT EXISTS costo_pratiche_default numeric,
  ADD COLUMN IF NOT EXISTS manutenzione_annua_eur numeric,
  ADD COLUMN IF NOT EXISTS cpl_max_sostenibile numeric,
  ADD COLUMN IF NOT EXISTS capacita_installazioni_mese integer,
  ADD COLUMN IF NOT EXISTS zona_servita_note text;

COMMENT ON COLUMN public.fv_template_pdf.valore_proposta_html IS
  'Proposta di valore FV mostrata nel PDF: metodo, risparmio, payback, pratiche e prossimi passi.';
COMMENT ON COLUMN public.fv_template_pdf.garanzie_conversione IS
  'Array JSONB di garanzie commerciali/operative orientate alla conversione.';
COMMENT ON COLUMN public.fv_template_pdf.faq_items IS
  'FAQ e obiezioni frequenti da mostrare nel preventivo FV.';
COMMENT ON COLUMN public.fv_template_pdf.margine_target_pct IS
  'Margine target usato per valutare sostenibilita commerciale e campagne.';
COMMENT ON COLUMN public.fv_template_pdf.cpl_max_sostenibile IS
  'Costo lead massimo sostenibile per campagne FV.';
COMMENT ON COLUMN public.fv_template_pdf.capacita_installazioni_mese IS
  'Capacita commerciale/installativa mensile prima di scalare il budget.';
