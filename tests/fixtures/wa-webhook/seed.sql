-- MP01 — Seed DB di test
-- Esegui questo SQL dopo aver applicato le migrazioni MP01 e PRIMA di
-- lanciare run-tests.sh. Popola un'azienda demo con 4 numeri WhatsApp
-- con purpose diversi (3 attivi, 1 sospeso).
-- Idempotente: ON CONFLICT DO NOTHING.

INSERT INTO public.companies (id, name, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'Rossi Costruzioni Srl TEST', 'test@mp01.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_whatsapp_numbers (
  id, company_id, purpose, numero, phone_number_id, waba_id,
  agent_id, stato, webhook_verified, display_name
) VALUES
  (
    'aaaaaaaa-0001-0001-0001-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'bot_operativo', '+390299990001', 'TEST_PHONE_ID_BOT_OPERATIVO_001',
    'WABA_ID_TEST_001', NULL, 'active', true, 'Bot Operativo Test'
  ),
  (
    'aaaaaaaa-0002-0002-0002-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'assistenza', '+390299990002', 'TEST_PHONE_ID_ASSISTENZA_001',
    'WABA_ID_TEST_001', NULL, 'active', true, 'Assistenza Test'
  ),
  (
    'aaaaaaaa-0003-0003-0003-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'lead', '+390299990003', 'TEST_PHONE_ID_LEAD_001',
    'WABA_ID_TEST_001', NULL, 'active', true, 'Lead Test'
  ),
  (
    'aaaaaaaa-0004-0004-0004-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'marketing', '+390299990004', 'TEST_PHONE_ID_DISABLED_001',
    'WABA_ID_TEST_001', NULL, 'suspended', true, 'Marketing Test Disabled'
  )
ON CONFLICT (id) DO NOTHING;
