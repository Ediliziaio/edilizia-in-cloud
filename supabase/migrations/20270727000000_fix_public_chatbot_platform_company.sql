-- Fix: il chatbot pubblico del sito marketing (token seed 859db08e…) era
-- agganciato a una company CLIENTE (il seed 20270518110000 sceglieva la
-- company con match best-effort su nome/email "edilizia…cloud" e in
-- produzione ha matchato Demo Azienda S.r.l.): ogni visitatore che scriveva
-- in chat creava sessioni, messaggi e CONTATTI dentro il CRM della Demo,
-- e i costi AI finivano sul suo budget.
-- I lead del sito appartengono alla company piattaforma "Platform Admin CRM"
-- (00000000-0000-0000-0000-000000000001), la stessa usata da
-- public-lead-submit per i form del sito.
-- Idempotente: se il token non esiste o è già sulla piattaforma, no-op.
-- (La migrazione dei dati storici già creati sotto la company sbagliata è
-- stata eseguita una tantum in produzione l'11/06/2026.)

UPDATE public.public_chatbot_settings
SET company_id = '00000000-0000-0000-0000-000000000001',
    updated_at = now()
WHERE public_widget_token = '859db08e-494d-4b15-ba85-7da57849df87'
  AND company_id <> '00000000-0000-0000-0000-000000000001'
  AND EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = '00000000-0000-0000-0000-000000000001'
  );
