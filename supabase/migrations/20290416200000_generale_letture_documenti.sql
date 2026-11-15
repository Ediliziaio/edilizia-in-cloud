-- Commessa generale dai documenti, lotto 1 (docs/piano-commessa-generale-da-documenti.md, §3).
--
-- Una LETTURA è un caricamento di documenti da cui nascerà (o si completerà) una commessa
-- generale. Ogni pagina ha una riga: è così che «letto tutto» si può dimostrare — una lettura è
-- finita solo quando nessuna pagina è più in coda o in lettura.
--
-- Chi fa cosa:
-- - il browser divide i PDF, legge il testo nativo, riconosce le pagine bianche e i computi
--   strutturati (XPWE, Excel, PriMus): niente AI, niente CPU del server. Crea la lettura con
--   `generale_lettura_crea`, con le pagine già lette e quelle da passare all'OCR;
-- - l'edge function `generale-documenti-leggi` prende in carico le pagine a giri
--   (`generale_lettura_prendi_pagine`, atomica), fa l'OCR, poi estrae i dati;
-- - il popup legge le due tabelle (RLS: chi può modificare le commesse dell'azienda).
--
-- Le scritture del browser passano solo dalle RPC: niente insert/update diretti.

-- ─── Compiti del router (stessi livelli di prezzo dell'OCR esistente) ──────────
insert into public.ai_router_config (task_key, task_label, task_description, primary_model, fallback_models, default_params, category, estimated_cost_per_million, enabled, tier_key)
values
  ('generale_documenti_ocr', 'Commessa generale: OCR di una pagina',
   'Trascrizione di una singola pagina scansionata dei documenti di una commessa generale (contratto, verbali, polizze, computi).',
   'google/gemini-2.5-flash', '["anthropic/claude-haiku-4.5","openai/gpt-4o-mini"]'::jsonb,
   '{"max_tokens":6000,"temperature":0}'::jsonb, 'extraction', 0.4000, true, 't2_vision'),
  ('generale_documenti_estrai', 'Commessa generale: estrazione dei dati',
   'Estrazione dei campi del catalogo (importi, date, codici, penali, garanzie) da un gruppo di pagine già trascritte, con pagina e citazione.',
   'google/gemini-2.5-flash', '["anthropic/claude-haiku-4.5","openai/gpt-4o-mini"]'::jsonb,
   '{"max_tokens":8000,"temperature":0}'::jsonb, 'extraction', 0.4000, true, 't2_vision')
on conflict (task_key) do nothing;

-- ─── Tabelle ───────────────────────────────────────────────────────────────────
create table if not exists public.generale_letture (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('appalto_pubblico','appalto_privato','sviluppo','compravendita')),
  -- Solo per l'appalto pubblico: contratto singolo, accordo quadro, contratto applicativo di un accordo.
  forma text check (forma in ('singolo','accordo_quadro','applicativo')),
  -- La generale da completare (applicativo) o quella creata alla conferma.
  generale_id uuid references public.orders(id) on delete set null,
  stato text not null default 'preparata'
    check (stato in ('preparata','in_lettura','in_pausa','estrazione','pronta','errore','usata','annullata')),
  -- [{id, nome, documento, percorso, mime, byte, pagine, strutturato}]
  file jsonb not null default '[]'::jsonb,
  -- Computi letti dal browser senza AI: {file_id: {totale, voci:[…], formato}}
  strutturati jsonb not null default '{}'::jsonb,
  stima_eur numeric(10,4) not null default 0,
  costo_eur numeric(10,4) not null default 0,
  -- DatiLetti: {chiave: [{valore, file, pagina, citazione, certezza, aMano?}]}
  dati jsonb not null default '{}'::jsonb,
  avvisi jsonb not null default '[]'::jsonb,
  -- Scelte, conferme e controlli accettati nel popup «Costruisci»: si chiude e si riprende.
  bozza jsonb not null default '{}'::jsonb,
  -- Cosa ha creato la conferma, per «Annulla tutto».
  creato jsonb,
  errore text,
  avviata_at timestamptz,
  finita_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists generale_letture_company_idx on public.generale_letture (company_id, created_at desc);
create index if not exists generale_letture_generale_idx on public.generale_letture (generale_id) where generale_id is not null;

create table if not exists public.generale_lettura_pagine (
  lettura_id uuid not null references public.generale_letture(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  file_id text not null,
  numero integer not null check (numero > 0),
  stato text not null default 'in_coda'
    check (stato in ('in_coda','in_lettura','testo','ocr','parser','bianca','esclusa','illeggibile')),
  -- Cosa c'è sulla pagina (articolato, polizza, computo…), da regole sul testo.
  classe text,
  testo text,
  motivo text,
  -- La pagina da passare all'OCR (PDF di una pagina o immagine) nel bucket documenti-smart.
  percorso text,
  -- sha256 della pagina: la stessa pagina non si paga due volte (chiave di cache e idempotenza).
  hash text,
  tentativi integer not null default 0,
  lease_fino timestamptz,
  costo_eur numeric(10,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (lettura_id, file_id, numero)
);
create index if not exists generale_lettura_pagine_coda_idx on public.generale_lettura_pagine (lettura_id) where stato in ('in_coda','in_lettura');

alter table public.generale_letture enable row level security;
alter table public.generale_lettura_pagine enable row level security;

drop policy if exists generale_letture_lettura on public.generale_letture;
create policy generale_letture_lettura on public.generale_letture for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id));

drop policy if exists generale_lettura_pagine_lettura on public.generale_lettura_pagine;
create policy generale_lettura_pagine_lettura on public.generale_lettura_pagine for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id));

revoke insert, update, delete on public.generale_letture, public.generale_lettura_pagine from anon, authenticated;
grant select on public.generale_letture, public.generale_lettura_pagine to authenticated;

-- ─── Stima del costo (prima di «Leggi») ────────────────────────────────────────
-- OCR: una chiamata per pagina-immagine (media osservata ~0,012 €, si tiene 0,015).
-- Estrazione: un gruppo ogni 15 pagine con testo (fino a ~0,06 € l'uno, si tiene 0,05).
create or replace function public.generale_lettura_stima(p_id uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select round(
    0.015 * count(*) filter (where stato in ('in_coda','in_lettura'))
    + 0.05 * greatest(1, ceil(count(*) filter (where stato in ('in_coda','in_lettura','testo','ocr')) / 15.0)),
  4)
  from public.generale_lettura_pagine where lettura_id = p_id;
$$;
revoke all on function public.generale_lettura_stima(uuid) from public, anon;
grant execute on function public.generale_lettura_stima(uuid) to authenticated, service_role;

-- ─── Creazione dal browser ─────────────────────────────────────────────────────
-- p_file:   [{id, nome, documento, percorso, mime, byte, pagine, strutturato}]
-- p_pagine: [{file_id, numero, stato, classe, testo, percorso, hash}] — stato fra in_coda, testo,
--           bianca, parser; la classe la decide il browser sul testo nativo.
create or replace function public.generale_lettura_crea(
  p_company uuid, p_tipo text, p_forma text, p_generale uuid,
  p_file jsonb, p_pagine jsonb, p_strutturati jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_p jsonb;
  v_f jsonb;
begin
  if auth.uid() is null
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', p_company) is not true then
    raise exception 'Serve il permesso di modificare le commesse' using errcode = '42501';
  end if;
  if jsonb_typeof(p_file) <> 'array' or jsonb_array_length(p_file) = 0 or jsonb_array_length(p_file) > 30 then
    raise exception 'Carica da 1 a 30 file';
  end if;
  if jsonb_typeof(p_pagine) <> 'array' or jsonb_array_length(p_pagine) > 2000 then
    raise exception 'Troppe pagine: il massimo è 2.000 per lettura';
  end if;
  -- I file stanno nella cartella dell'azienda: niente percorsi di altri.
  for v_f in select * from jsonb_array_elements(p_file) loop
    if coalesce(v_f->>'percorso', '') !~ ('^' || p_company::text || '/generali-letture/[^.][^/]*/') then
      raise exception 'Percorso del file non valido';
    end if;
  end loop;
  if p_generale is not null and not exists (
    select 1 from public.orders o where o.id = p_generale and o.company_id = p_company and o.workflow_kind = 'generale'
  ) then
    raise exception 'Commessa generale non trovata';
  end if;

  insert into public.generale_letture (company_id, created_by, tipo, forma, generale_id, file, strutturati)
  values (p_company, auth.uid(), p_tipo, nullif(p_forma, ''), p_generale, p_file, coalesce(p_strutturati, '{}'::jsonb))
  returning id into v_id;

  for v_p in select * from jsonb_array_elements(p_pagine) loop
    if coalesce(v_p->>'stato', '') not in ('in_coda','testo','bianca','parser') then
      raise exception 'Stato di pagina non valido';
    end if;
    if v_p->>'percorso' is not null and v_p->>'percorso' !~ ('^' || p_company::text || '/generali-letture/[^.][^/]*/') then
      raise exception 'Percorso della pagina non valido';
    end if;
    insert into public.generale_lettura_pagine (lettura_id, company_id, file_id, numero, stato, classe, testo, percorso, hash)
    values (v_id, p_company, v_p->>'file_id', (v_p->>'numero')::int, v_p->>'stato',
            left(v_p->>'classe', 80), left(v_p->>'testo', 200000), v_p->>'percorso', left(v_p->>'hash', 80));
  end loop;

  update public.generale_letture set stima_eur = public.generale_lettura_stima(v_id) where id = v_id;
  return v_id;
end $$;
revoke all on function public.generale_lettura_crea(uuid, text, text, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.generale_lettura_crea(uuid, text, text, uuid, jsonb, jsonb, jsonb) to authenticated;

-- ─── Bozza del popup «Costruisci» ──────────────────────────────────────────────
create or replace function public.generale_lettura_bozza_salva(p_id uuid, p_bozza jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.generale_letture where id = p_id;
  if v_company is null or auth.uid() is null
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true then
    raise exception 'Lettura non trovata' using errcode = '42501';
  end if;
  if pg_column_size(p_bozza) > 2000000 then raise exception 'Bozza troppo grande'; end if;
  update public.generale_letture set bozza = coalesce(p_bozza, '{}'::jsonb), updated_at = now() where id = p_id;
end $$;
revoke all on function public.generale_lettura_bozza_salva(uuid, jsonb) from public, anon;
grant execute on function public.generale_lettura_bozza_salva(uuid, jsonb) to authenticated;

-- ─── Annullare una lettura (le pagine restano per la traccia; si ferma solo il lavoro) ───
create or replace function public.generale_lettura_annulla(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.generale_letture where id = p_id;
  if v_company is null or auth.uid() is null
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true then
    raise exception 'Lettura non trovata' using errcode = '42501';
  end if;
  update public.generale_letture set stato = 'annullata', updated_at = now()
   where id = p_id and stato not in ('usata','annullata');
end $$;
revoke all on function public.generale_lettura_annulla(uuid) from public, anon;
grant execute on function public.generale_lettura_annulla(uuid) to authenticated;

-- ─── Presa in carico atomica, per i giri dell'edge function (solo service role) ───
-- Una pagina «in lettura» da più di 3 minuti è di un giro morto: torna prendibile.
create or replace function public.generale_lettura_prendi_pagine(p_id uuid, p_quante integer)
returns setof public.generale_lettura_pagine
language sql
security definer
set search_path = public
as $$
  update public.generale_lettura_pagine g
     set stato = 'in_lettura', lease_fino = now() + interval '3 minutes', tentativi = g.tentativi + 1, updated_at = now()
   where (g.lettura_id, g.file_id, g.numero) in (
     select lettura_id, file_id, numero from public.generale_lettura_pagine
      where lettura_id = p_id
        and (stato = 'in_coda' or (stato = 'in_lettura' and lease_fino < now()))
      order by file_id, numero
      limit greatest(1, least(p_quante, 20))
      for update skip locked)
  returning g.*;
$$;
revoke all on function public.generale_lettura_prendi_pagine(uuid, integer) from public, anon, authenticated;
grant execute on function public.generale_lettura_prendi_pagine(uuid, integer) to service_role;
