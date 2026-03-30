
-- Fix: make the view use SECURITY INVOKER explicitly
DROP VIEW IF EXISTS public.fattura_pagamento_stato CASCADE;
CREATE OR REPLACE VIEW public.fattura_pagamento_stato
WITH (security_invoker = true)
AS
SELECT
  df.id                                                       AS fattura_id,
  df.company_id,
  df.totale_da_pagare                                         AS importo_totale,
  COALESCE(SUM(m.importo), 0)                                 AS importo_incassato,
  df.totale_da_pagare - COALESCE(SUM(m.importo), 0)           AS importo_residuo,
  CASE
    WHEN COALESCE(SUM(m.importo), 0) >= df.totale_da_pagare THEN 'pagata'
    WHEN COALESCE(SUM(m.importo), 0) > 0                    THEN 'parziale'
    WHEN df.data_scadenza IS NOT NULL AND df.data_scadenza::date < CURRENT_DATE THEN 'scaduta'
    ELSE 'in_attesa'
  END                                                         AS stato_pagamento,
  MAX(m.data_movimento)                                       AS ultimo_incasso,
  COUNT(m.id)::int                                            AS numero_incassi
FROM public.documenti_fiscali df
LEFT JOIN public.movimenti_cassa_native m ON m.documento_id = df.id AND m.tipo = 'entrata'
WHERE df.stato != 'annullata'
GROUP BY df.id, df.company_id, df.totale_da_pagare, df.data_scadenza;
