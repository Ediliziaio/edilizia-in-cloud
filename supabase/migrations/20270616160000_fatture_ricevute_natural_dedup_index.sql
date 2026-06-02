-- Dedup robusto delle fatture passive: la maggior parte degli XML FatturaPA NON
-- contiene IdentificativoSdI (assegnato da SDI nel wrapper di metadati), quindi
-- l'unique index parziale esistente su sdi_id_trasmissione non protegge i casi reali.
-- Aggiungo una chiave naturale (company_id + cedente P.IVA + numero + data) che
-- impedisce righe duplicate alla riconsegna del webhook.

-- Dedup difensivo (mantiene la riga più vecchia) prima dell'indice unico.
DELETE FROM public.fatture_ricevute a
USING public.fatture_ricevute b
WHERE a.ctid > b.ctid
  AND a.company_id = b.company_id
  AND a.cedente_piva IS NOT DISTINCT FROM b.cedente_piva
  AND a.numero_fattura IS NOT DISTINCT FROM b.numero_fattura
  AND a.data_fattura IS NOT DISTINCT FROM b.data_fattura
  AND a.numero_fattura IS NOT NULL
  AND a.cedente_piva IS NOT NULL
  AND a.data_fattura IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fatture_ricevute_natural
  ON public.fatture_ricevute (company_id, cedente_piva, numero_fattura, data_fattura)
  WHERE numero_fattura IS NOT NULL AND cedente_piva IS NOT NULL AND data_fattura IS NOT NULL;
