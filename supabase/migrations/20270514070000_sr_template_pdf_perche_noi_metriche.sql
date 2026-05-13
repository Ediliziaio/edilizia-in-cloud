-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 10: "Perché noi" data-driven — metriche numeriche nel PDF
-- ────────────────────────────────────────────────────────────────────────────
-- L'attuale sezione "Perché [companyName]" mostra una lista bullet di USP
-- testuali. Aggiungiamo SOPRA una riga di metriche numeriche big-numbers
-- (es. "127 cantieri completati", "9.4/10 soddisfazione", "10 anni garanzia")
-- per dare credibilità e "anchor" prima della lista qualitativa.
--
-- Schema metrica: { label: string, value: string, suffix?: string, icon?: string }
--   • value e suffix sono stringhe (es. "127" + " cantieri", "9.4" + "/10")
--   • icon è un emoji singolo o un pittogramma identificativo
--   • L'array è completamente custom — l'azienda compila i numeri reali.
--
-- Aggiunto anche `anno_fondazione` sulla company (numero intero) — il PDF
-- può calcolare automaticamente "X anni di esperienza" come default
-- suggerito nelle metriche.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_perche_noi_metriche JSONB
    DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS anno_fondazione INTEGER;

COMMENT ON COLUMN public.sr_template_pdf.pdf_perche_noi_metriche IS
  'Array di metriche big-number mostrate nella sezione "Perché noi" del PDF. '
  'Schema: [{ label, value, suffix?, icon? }]. Renderizzate come grid 4×1 '
  'sopra la lista bullet USP. Vuoto di default — opt-in per aziende con '
  'storico di cantieri o referenze numeriche.';

COMMENT ON COLUMN public.companies.anno_fondazione IS
  'Anno di fondazione dell''azienda (es. 2010). Usato dal PDF per derivare '
  'automaticamente "X anni di esperienza" come metrica suggerita.';

NOTIFY pgrst, 'reload schema';
