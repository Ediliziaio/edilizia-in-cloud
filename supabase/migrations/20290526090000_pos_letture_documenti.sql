-- POS: lettura di PSC e contratto come lavoro registrato (23/11/2026)
--
-- «Leggi PSC e contratto» nell'editor del POS avvia una lettura AI che propone accessi, consegne,
-- servizi, coordinamento dei fronti, orari ed emergenze, ciascuno con la citazione letterale della
-- pagina da cui viene. La lettura gira in background in genera-pos: questa tabella ne tiene lo stato.
--
-- · una riga per POS e impronta dei documenti (PSC id/revisione/sha256 + contratto id/sha256):
--   un secondo clic ritrova la stessa lettura, non ne paga un'altra;
-- · `parziali` salva ogni blocco appena letto: un worker fermato riparte dal primo blocco mancante;
-- · `decisioni` conserva la scelta dell'utente sui conflitti fra PSC e contratto, che la proposta
--   delle lavorazioni rispetta.
--
-- Chiusa al browser come pos_ocr_letture: legge e scrive solo genera-pos, con la chiave di servizio,
-- dopo i controlli di azienda e permesso. Le righe seguono l'azienda, la commessa e il POS (cascade),
-- quindi la purga le toglie e il backup le prende per company_id.

create table if not exists public.pos_letture_documenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  pos_id uuid not null references public.pos_documents(id) on delete cascade,
  impronta text not null check (char_length(impronta) between 10 and 600),
  stato text not null default 'in_corso' check (stato in ('in_corso', 'pronta', 'errore')),
  fonti jsonb not null default '{}'::jsonb,
  parziali jsonb not null default '[]'::jsonb,
  risultato jsonb,
  decisioni jsonb not null default '{}'::jsonb,
  avvisi jsonb not null default '[]'::jsonb,
  errore text check (errore is null or char_length(errore) <= 1000),
  richiesto_da uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completata_il timestamptz,
  unique (pos_id, impronta)
);

create index if not exists pos_letture_documenti_pos
  on public.pos_letture_documenti (company_id, pos_id, created_at desc);

alter table public.pos_letture_documenti enable row level security;
revoke all on public.pos_letture_documenti from public, anon, authenticated;
grant select, insert, update, delete on public.pos_letture_documenti to service_role;

comment on table public.pos_letture_documenti is
  'Letture AI di PSC e contratto per il POS (genera-pos: avvia/stato/decidi_lettura_documenti). Solo service role.';
