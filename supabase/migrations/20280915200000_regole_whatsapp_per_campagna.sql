-- Regole WhatsApp anche per CAMPAGNA.
--
-- Le regole esistevano solo per numero (parole chiave → risposta automatica,
-- etichette, assegna, avvisa, ignora). Una campagna a freddo ha bisogno di
-- decidere cosa succede quando un SUO destinatario risponde: fermare il
-- flusso, spostarlo sulla bacheca (esito), smettere di scrivergli. Una regola
-- con campagna_id vale solo per i destinatari di quella campagna; senza,
-- continua a valere per tutti come prima.

ALTER TABLE public.openwa_rules
  ADD COLUMN IF NOT EXISTS campagna_id uuid REFERENCES public.openwa_campagne(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ferma_flusso boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imposta_esito text,
  ADD COLUMN IF NOT EXISTS optout boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'openwa_rules_imposta_esito_check') THEN
    ALTER TABLE public.openwa_rules ADD CONSTRAINT openwa_rules_imposta_esito_check
      CHECK (imposta_esito IS NULL OR imposta_esito IN ('da_ricontattare', 'appuntamento', 'cliente', 'non_interessato'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_openwa_rules_campagna ON public.openwa_rules (campagna_id) WHERE campagna_id IS NOT NULL;

-- Le campagne (e il destinatario) di chi ha appena scritto. Per TELEFONO,
-- come openwa_campagna_segna_risposta: il contatto agganciato alla chat può
-- essere la scheda gemella di quello messo in campagna.
CREATE OR REPLACE FUNCTION public.openwa_destinatari_di_chi_scrive(p_phone text, p_contact_id uuid DEFAULT NULL)
RETURNS TABLE (destinatario_id uuid, campagna_id uuid, contact_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.campagna_id, d.contact_id
    FROM public.openwa_campagna_destinatari d
   WHERE (p_contact_id IS NOT NULL AND d.contact_id = p_contact_id)
      OR (public.openwa_norm_tel(p_phone) IS NOT NULL AND d.contact_id IN (
            SELECT mc.id FROM public.marketing_contacts mc
             WHERE mc.company_id = '00000000-0000-0000-0000-000000000001'
               AND mc.phone IS NOT NULL
               AND public.openwa_norm_tel(mc.phone) = public.openwa_norm_tel(p_phone)));
$$;

-- Solo il webhook (service role) la chiama: niente anon, niente utenti.
REVOKE ALL ON FUNCTION public.openwa_destinatari_di_chi_scrive(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.openwa_destinatari_di_chi_scrive(text, uuid) TO service_role;
