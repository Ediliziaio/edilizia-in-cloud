-- WhatsApp Locale — mappa LID → numero di telefono.
--
-- WhatsApp ha introdotto i LID ("linked id", es. 194360188621035@lid): un
-- identificativo anonimo che sostituisce il numero nei messaggi IN ARRIVO.
-- Risultato senza questa mappa: il messaggio che INVIAMO a 393483467567@c.us e
-- la RISPOSTA che arriva da 194360188621035@lid finiscono in due conversazioni
-- diverse, e l'inbox mostra due thread scollegati della stessa persona.
--
-- La corrispondenza la conosce gia' il gateway: l'id del messaggio inviato
-- (`true_194360188621035@lid_3EB0...`) contiene il LID del destinatario a cui
-- abbiamo scritto per numero. Qui la registriamo per poterla riusare.

create table if not exists public.openwa_lid_map (
  lid          text primary key,
  phone        text not null,          -- E.164 con il +
  chat_id      text not null,          -- forma canonica: 39...@c.us
  fonte        text not null default 'outbound',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.openwa_lid_map is
  'WhatsApp Locale: corrispondenza LID -> numero, per ricucire i thread dell''inbox.';

create index if not exists openwa_lid_map_phone_idx on public.openwa_lid_map (phone);

-- Solo il service_role (webhook + gateway) tocca questa tabella; nessuna policy
-- per gli utenti: l'inbox legge i messaggi gia' normalizzati, non la mappa.
alter table public.openwa_lid_map enable row level security;

-- Il LID originale resta sul messaggio: serve a capire da dove e' arrivato e a
-- ricucire a posteriori i messaggi ricevuti prima che la mappa fosse nota.
alter table public.openwa_messages add column if not exists wa_lid text;
create index if not exists openwa_messages_wa_lid_idx on public.openwa_messages (wa_lid) where wa_lid is not null;
