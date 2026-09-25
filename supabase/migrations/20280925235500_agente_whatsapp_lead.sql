-- Agente WhatsApp dei lead (25/09/2026).
--
-- 1. Pausa dell'assistente per conversazione. Quando una persona prende in
--    mano la chat (o l'agente passa la mano con «passa_a_operatore»), l'agente
--    non deve più rispondere a quel contatto finché qualcuno non lo riattiva.
--    Prima c'era solo l'interruttore per numero (operational_settings.bot_enabled):
--    tutto o niente.
-- 2. Indice per leggere la storia di una chat per contatto e in ordine di
--    tempo, nei due versi: l'agente la rilegge a ogni messaggio.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.conversazioni
  add column if not exists bot_in_pausa boolean not null default false,
  add column if not exists bot_in_pausa_motivo text,
  add column if not exists bot_in_pausa_il timestamptz;

comment on column public.conversazioni.bot_in_pausa is
  'Se vero l''agente WhatsApp non risponde in questa conversazione: la segue una persona.';

create index if not exists idx_whatsapp_messages_contatto_data
  on public.whatsapp_messages (contact_id, created_at desc)
  where contact_id is not null;
