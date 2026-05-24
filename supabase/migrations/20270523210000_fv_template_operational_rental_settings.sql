-- Aggiunge impostazioni di noleggio operativo B2B al template PDF/preventivatore FV.

ALTER TABLE public.fv_template_pdf
  ADD COLUMN IF NOT EXISTS noleggio_operativo_attivo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS noleggio_durata_default_mesi integer DEFAULT 84,
  ADD COLUMN IF NOT EXISTS noleggio_fattore_default numeric DEFAULT 1.18,
  ADD COLUMN IF NOT EXISTS noleggio_aliquota_fiscale_pct numeric DEFAULT 0.24,
  ADD COLUMN IF NOT EXISTS noleggio_note_legali text;

COMMENT ON COLUMN public.fv_template_pdf.noleggio_operativo_attivo IS
  'Se TRUE, il preventivatore FV mostra lo scenario noleggio operativo per aziende/condomini/CER.';
COMMENT ON COLUMN public.fv_template_pdf.noleggio_durata_default_mesi IS
  'Durata default in mesi per il canone di noleggio operativo FV.';
COMMENT ON COLUMN public.fv_template_pdf.noleggio_fattore_default IS
  'Fattore totale stimato del noleggio operativo: 1.18 = 118% del capitale netto su durata.';
COMMENT ON COLUMN public.fv_template_pdf.noleggio_aliquota_fiscale_pct IS
  'Aliquota stimata usata per simulare il beneficio fiscale mensile sul canone.';
COMMENT ON COLUMN public.fv_template_pdf.noleggio_note_legali IS
  'Nota legale/fiscale da mostrare o riusare nella proposta noleggio operativo FV.';
