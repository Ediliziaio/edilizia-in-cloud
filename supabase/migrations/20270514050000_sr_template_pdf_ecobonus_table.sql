-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 8: Tabella ecobonus 10 anni nel PDF
-- ────────────────────────────────────────────────────────────────────────────
-- Toggle che, quando attivo, aggiunge sotto la card "Detrazione fiscale"
-- una mini-tabella visiva 5×2 con il breakdown anno-per-anno della quota
-- recuperabile, più colonna del cumulato.
--
-- Visibile SOLO se p.detrazione_aliquota e detrazione_eur_anno sono
-- valorizzati. Default false: non tutti i serramentisti vogliono essere
-- super-espliciti sul calendario fiscale (preferiscono lasciarlo al
-- commercialista del cliente).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_mostra_tabella_ecobonus BOOLEAN
    DEFAULT false NOT NULL;

COMMENT ON COLUMN public.sr_template_pdf.pdf_mostra_tabella_ecobonus IS
  'Mostra mini-tabella 10 anni con il breakdown della detrazione fiscale '
  'recuperabile (quota annuale + cumulato). Off di default per non '
  'appesantire il PDF — utile per clienti residenziali che chiedono '
  'esplicitamente il calendario fiscale.';

NOTIFY pgrst, 'reload schema';
