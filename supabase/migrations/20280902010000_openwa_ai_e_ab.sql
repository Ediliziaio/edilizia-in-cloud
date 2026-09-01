-- Campagne WhatsApp Locale: report risposte, personalizzazione AI, A/B test.
--
-- Tre cose che il flusso a freddo chiedeva:
--  1. leggere in aggregato COSA hanno risposto (prima: una chat alla volta);
--  2. adattare il messaggio al contatto (settore, citta', dimensione) — ogni
--     messaggio diverso dagli altri e' anche la miglior difesa anti-ban;
--  3. capire quale MESSAGGIO rende: variante B sul primo invio, assegnata a
--     meta' lista, e tassi a confronto.

-- ── Colonne campagna ─────────────────────────────────────────────────────────
alter table public.openwa_campagne
  add column if not exists ai_personalizza boolean not null default false,
  add column if not exists ai_istruzioni text,
  add column if not exists messaggio_b text;

comment on column public.openwa_campagne.ai_personalizza is
  'Se attivo, il dispatcher riscrive il messaggio col contesto del contatto (AI). In errore parte il testo base: la coda non si ferma mai per il modello.';
comment on column public.openwa_campagne.messaggio_b is
  'Variante B del PRIMO messaggio (A/B). Assegnata al 50% dei destinatari al primo invio.';

-- ── Variante sul destinatario ────────────────────────────────────────────────
alter table public.openwa_campagna_destinatari
  add column if not exists variante text check (variante in ('A', 'B'));

-- ── Report risposte ──────────────────────────────────────────────────────────
-- Una riga per chi ha risposto (o e' gia' qualificato), col TESTO della prima
-- risposta arrivata dopo il primo invio: e' il dato che giudica il messaggio.
create or replace function public.openwa_campagna_risposte(p_campagna_id uuid)
returns table (
  destinatario_id uuid,
  contact_id uuid,
  nome text,
  telefono text,
  variante text,
  esito text,
  risposto_at timestamptz,
  testo_risposta text,
  wa_chat_id text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  return query
  select d.id, d.contact_id,
         coalesce(nullif(trim(coalesce(mc.first_name,'') || ' ' || coalesce(mc.last_name,'')), ''), mc.company_name, mc.phone),
         mc.phone, d.variante, d.esito, d.risposto_at,
         r.body, r.wa_chat_id
  from public.openwa_campagna_destinatari d
  join public.marketing_contacts mc on mc.id = d.contact_id
  left join lateral (
    select m.body, m.wa_chat_id
    from public.openwa_messages m
    where m.contact_id = d.contact_id
      and m.direction = 'inbound'
      and (d.primo_inviato_at is null or m.created_at >= d.primo_inviato_at)
    order by m.created_at asc
    limit 1
  ) r on true
  where d.campagna_id = p_campagna_id
    and (d.stato = 'risposto' or d.esito is not null)
  order by d.risposto_at desc nulls last;
end;
$$;
grant execute on function public.openwa_campagna_risposte to authenticated;

-- ── Tassi per variante (denominatori inclusi: i soli rispondenti non bastano) ─
create or replace function public.openwa_campagna_ab(p_campagna_id uuid)
returns table (variante text, inviati bigint, risposte bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  return query
  select d.variante,
         count(*) filter (where d.stato <> 'da_inviare'),
         count(*) filter (where d.stato = 'risposto' or d.esito is not null)
  from public.openwa_campagna_destinatari d
  where d.campagna_id = p_campagna_id and d.variante is not null
  group by d.variante order by d.variante;
end;
$$;
grant execute on function public.openwa_campagna_ab to authenticated;

-- ── Registro AI: due task nel router (modelli economici, fallback robusti) ───
insert into public.ai_router_config (task_key, task_label, task_description, primary_model, fallback_models, default_params, category, enabled)
values
  ('openwa_personalizza', 'WhatsApp Locale · personalizza messaggio',
   'Adatta il messaggio di campagna al contesto del contatto (settore, citta'', dimensione). Vincoli duri: stesso significato, niente promesse aggiunte.',
   'deepseek/deepseek-chat-v3.1',
   '["openai/gpt-4o-mini","anthropic/claude-haiku-4.5","openrouter/auto"]'::jsonb,
   '{"max_tokens": 400, "temperature": 0.4}'::jsonb, 'marketing', true),
  ('openwa_classifica_risposta', 'WhatsApp Locale · classifica risposta',
   'Qualifica la risposta di un prospect: interessato / da ricontattare / non interessato.',
   'deepseek/deepseek-chat-v3.1',
   '["openai/gpt-4o-mini","anthropic/claude-haiku-4.5","openrouter/auto"]'::jsonb,
   '{"max_tokens": 200, "temperature": 0}'::jsonb, 'marketing', true)
on conflict (task_key) do nothing;
