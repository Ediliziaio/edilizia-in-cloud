-- Consenso marketing POSITIVO sui contatti.
--
-- Finora esisteva solo il negativo (optout_whatsapp/email/sms/call,
-- unsubscribed, optout_at/optout_reason — le ultime due mai scritte da
-- nessuno): non c'era NESSUN posto dove registrare che il contatto HA
-- acconsentito al marketing, con quando e come. GDPR art. 7: il consenso
-- va potuto dimostrare.
--
-- Tre stati onesti: null = mai registrato (default per tutti gli esistenti,
-- niente consensi inventati retroattivamente), true = dato, false = negato.
-- Scrittura SOLO manuale dalla scheda contatto per ora: nessun form pubblico
-- ha oggi una checkbox consenso di cui fidarsi.

alter table public.marketing_contacts
  add column if not exists marketing_consent boolean,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_consent_source text;

comment on column public.marketing_contacts.marketing_consent is
  'Consenso marketing esplicito: null = mai registrato, true = dato, false = negato. Con marketing_consent_at e marketing_consent_source (es. "manuale — scheda contatto") per dimostrarlo.';
