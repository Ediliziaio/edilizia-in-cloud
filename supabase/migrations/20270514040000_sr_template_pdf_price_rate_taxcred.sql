-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 7: Box prezzo arricchito — rata mensile + recupero fiscale
-- ────────────────────────────────────────────────────────────────────────────
-- Due nuovi toggle nel template PDF preventivo:
--
--   pdf_mostra_rata_mensile     → se TRUE e ci sono piani finanziamento,
--                                 nel box "Il tuo investimento" appare la
--                                 sintesi "≈ da € XX/mese in YY mesi"
--                                 (preview senza dover scrollare alla
--                                 sezione finanziamento).
--
--   pdf_mostra_recupero_fiscale → se TRUE e la detrazione è configurata,
--                                 nel box "Il tuo investimento" appare il
--                                 "Netto dopo recupero fiscale: € XX"
--                                 (totale media − detrazione totale).
--
-- N.B. Niente "risparmio rispetto a preventivi tradizionali": l'utente ha
--      esplicitamente richiesto di NON mostrarlo (anchor troppo aggressivo).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_mostra_rata_mensile BOOLEAN
    DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS pdf_mostra_recupero_fiscale BOOLEAN
    DEFAULT true NOT NULL;

COMMENT ON COLUMN public.sr_template_pdf.pdf_mostra_rata_mensile IS
  'Mostra la rata mensile minima nel box "Il tuo investimento" del PDF '
  '(richiede almeno un piano di finanziamento configurato). Off di default '
  'perché non tutti i serramentisti propongono finanziamenti.';

COMMENT ON COLUMN public.sr_template_pdf.pdf_mostra_recupero_fiscale IS
  'Mostra il prezzo netto dopo recupero fiscale (es. ecobonus 50%) nel '
  'box "Il tuo investimento" del PDF. ON di default perché è il numero '
  'che più impatta la decisione del cliente residenziale.';

NOTIFY pgrst, 'reload schema';
