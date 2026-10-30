-- Planimetrie, fase 5b: il render della stanza ricorda da quale pianta e da quale
-- locale viene (30/10/2026).
--
-- STATO: PRONTA, NON APPLICATA. Va applicata DOPO 20281030260000_planimetrie_base
-- (serve la tabella planimetrie). Un file in supabase/migrations/ va in produzione al
-- primo push su main: prima di unire il ramo,
--   1. applicarla con apply_migration (nome: render_stanza_dalla_pianta);
--   2. riallineare la versione a 20281030291000 (vedi CLAUDE.md);
--   3. controllare v_funzioni_aperte_ad_anon (nessuna riga nuova).
--
-- Il riferimento vero sta in render_stanza_sessions.config -> 'planimetria'
-- ({ planimetria_id, versione, livello_id, ambito, locale_id, partenza, … }): lo scrive
-- il browser, lo legge generate-room-render. Così pagine e funzione funzionano anche
-- prima di questa migrazione. Qui:
-- - tre colonne copiate dal config da un trigger, per cercare i render di una pianta e
--   di un locale con un indice (e per non perderli se la pianta viene cancellata:
--   on delete set null);
-- - il trigger controlla che la pianta sia della stessa azienda della sessione.
--   SECURITY INVOKER: chi non vede la pianta (RLS) non la può collegare.
--
-- render_stanza_sessions ha poche righe (8 il 30/10/2026): le colonne nullable sono
-- istantanee. Idempotente: si può rieseguire.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.render_stanza_sessions
  add column if not exists planimetria_id uuid references public.planimetrie(id) on delete set null,
  add column if not exists planimetria_versione integer,
  add column if not exists planimetria_locale_id text;

comment on column public.render_stanza_sessions.planimetria_id is
  'Pianta da cui parte il render (modulo Planimetrie). Copiata da config->planimetria dal trigger render_stanza_collega_planimetria.';
comment on column public.render_stanza_sessions.planimetria_locale_id is
  'Id del locale nel documento della pianta (planimetrie_versioni.documento), non una chiave esterna.';

create index if not exists render_stanza_sessions_planimetria_idx
  on public.render_stanza_sessions (planimetria_id, planimetria_locale_id, created_at desc)
  where planimetria_id is not null;

create or replace function public.render_stanza_collega_planimetria()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ref jsonb := new.config -> 'planimetria';
  v_id uuid;
  v_azienda uuid;
begin
  if v_ref is null or jsonb_typeof(v_ref) <> 'object' or coalesce(v_ref ->> 'planimetria_id', '') = '' then
    new.planimetria_id := null;
    new.planimetria_versione := null;
    new.planimetria_locale_id := null;
    return new;
  end if;

  begin
    v_id := (v_ref ->> 'planimetria_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Pianta non valida.' using errcode = '22023';
  end;

  select company_id into v_azienda from public.planimetrie where id = v_id and deleted_at is null;
  if v_azienda is distinct from new.company_id then
    raise exception 'La pianta non è di questa azienda.' using errcode = '42501';
  end if;

  new.planimetria_id := v_id;
  new.planimetria_versione := case when (v_ref ->> 'versione') ~ '^[0-9]{1,9}$' then (v_ref ->> 'versione')::integer end;
  new.planimetria_locale_id := left(nullif(v_ref ->> 'locale_id', ''), 200);
  return new;
end;
$$;

-- Funzione di trigger: nessuno deve poterla chiamare (CLAUDE.md, «Funzioni esposte ad anon»).
revoke all on function public.render_stanza_collega_planimetria() from public, anon, authenticated;

drop trigger if exists render_stanza_collega_planimetria on public.render_stanza_sessions;
create trigger render_stanza_collega_planimetria
  before insert or update of config on public.render_stanza_sessions
  for each row execute function public.render_stanza_collega_planimetria();

-- Le sessioni già esistenti non hanno una pianta: niente da riempire.
