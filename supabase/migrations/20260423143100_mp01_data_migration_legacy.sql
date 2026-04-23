-- MP01 — Migrazione dati legacy
-- Copia le aziende da messaging_whatsapp_config → ai_whatsapp_numbers con
-- purpose='bot_operativo'. La tabella legacy NON viene droppata (verrà
-- deprecata fisicamente in MP4). Idempotente: safe re-run.
-- Owner: Florin Andriciuc | Data: 2026-04-23

BEGIN;

INSERT INTO public.ai_whatsapp_numbers (
  company_id,
  purpose,
  display_name,
  numero,
  phone_number_id,
  waba_id,
  provider,
  access_token_encrypted,
  nome_account,
  stato,
  webhook_verified,
  creato_il
)
SELECT
  mwc.company_id,
  'bot_operativo'::text                               AS purpose,
  COALESCE(mwc.business_name, 'Bot Operativo')        AS display_name,
  COALESCE(mwc.phone_number, '')                      AS numero,
  mwc.phone_number_id                                 AS phone_number_id,
  mwc.waba_id                                         AS waba_id,
  'meta_cloud'::text                                  AS provider,
  mwc.access_token_encrypted                          AS access_token_encrypted,
  mwc.business_name                                   AS nome_account,
  CASE WHEN mwc.is_connected THEN 'active' ELSE 'pending' END AS stato,
  COALESCE(mwc.is_connected, false)                   AS webhook_verified,
  mwc.created_at                                      AS creato_il
FROM public.messaging_whatsapp_config mwc
WHERE mwc.phone_number_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.ai_whatsapp_numbers awn
    WHERE awn.company_id = mwc.company_id
      AND awn.purpose = 'bot_operativo'
      AND awn.deleted_at IS NULL
  );

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- Report di verifica post-migrazione (commentato — eseguire manualmente)
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS legacy_count
--   FROM public.messaging_whatsapp_config
--   WHERE phone_number_id IS NOT NULL;
--
-- SELECT COUNT(*) AS bot_operativo_count
--   FROM public.ai_whatsapp_numbers
--   WHERE purpose = 'bot_operativo' AND deleted_at IS NULL;
--
-- I due conteggi devono corrispondere (± numeri bot_operativo già inseriti
-- direttamente in ai_whatsapp_numbers prima di MP01).
