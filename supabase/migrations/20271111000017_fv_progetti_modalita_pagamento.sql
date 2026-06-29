-- FV preventivatore: "Modalità di pagamento" diretto (acconto / SAL / saldo),
-- come negli altri preventivi. Affianca il finanziamento già presente.
--
-- Forma del jsonb:
--   { "tranche": [ { "label": "Acconto alla firma", "pct": 30 }, ... ],
--     "note": "testo libero condizioni" | null }
-- Le percentuali sommano a 100; gli importi in € si ricalcolano a runtime sul
-- prezzo di vendita IVA inclusa (la colonna conserva solo le %, non gli importi).
--
-- Additiva + idempotente: nessun impatto su righe esistenti (NULL ⇒ il wizard
-- mostra lo schema di default 30/40/30 e il PDF salta la sezione).

ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS modalita_pagamento jsonb;

COMMENT ON COLUMN public.fv_progetti.modalita_pagamento IS
  'Schema pagamento diretto: {"tranche":[{"label","pct"}],"note":string|null}. Le % sommano a 100; gli importi € si ricalcolano sul prezzo di vendita IVA inclusa.';
