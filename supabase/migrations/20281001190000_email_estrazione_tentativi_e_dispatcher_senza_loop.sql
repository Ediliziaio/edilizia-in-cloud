-- Estrazione allegati PDF delle email fornitore: niente più giro infinito (01/10/2026).
-- Il credito OpenRouter era finito (402 «requires at least $0.50 in balance for files»):
-- il dispatcher, ogni 7 minuti, riprendeva la stessa mail senza documento estratto e la
-- rimandava alla funzione, che falliva — 107 righe nel registro errori in 12 ore.
-- Ora l'esito fallito si ricorda: l'edge function scrive qui, il dispatcher salta chi deve
-- ancora aspettare. Credito esaurito: si riprova dopo un'ora. Altri errori: 30 min × 2^n,
-- e dopo 6 fallimenti basta. Solo service role: RLS attiva, nessuna policy.
create table if not exists public.email_estrazione_tentativi (
  email_id uuid primary key references public.email_inbox(id) on delete cascade,
  tentativi integer not null default 0,
  ultimo_esito text,
  ultimo_errore text,
  prossimo_tentativo timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_estrazione_tentativi enable row level security;
comment on table public.email_estrazione_tentativi is
  'Estrazioni di allegati PDF fallite: quando riprovare. Solo service role (nessuna policy).';

create or replace function public.silvio_email_dispatch_fatture(p_cron_secret text, p_limit integer default 5)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE rec record; v_n int := 0;
BEGIN
  FOR rec IN
    SELECT e.id FROM public.email_inbox e
    WHERE (e.categoria::text IN ('fattura','fornitore') OR e.ai_category IN ('fattura','fornitore'))
      AND COALESCE(e.is_trashed,false) = false
      AND jsonb_typeof(e.attachments) = 'array' AND jsonb_array_length(e.attachments) > 0
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.attachments) a
                  WHERE lower(coalesce(a->>'filename','')) LIKE '%.pdf' OR lower(coalesce(a->>'mime','')) LIKE '%pdf%')
      AND NOT EXISTS (SELECT 1 FROM public.email_documento_estratto d WHERE d.email_id = e.id)
      -- Una mail che ha già fallito aspetta il suo turno (credito esaurito: un'ora; altri
      -- errori: 30 min × 2^tentativi) e dopo 6 fallimenti non si riprova più.
      AND NOT EXISTS (SELECT 1 FROM public.email_estrazione_tentativi t
                      WHERE t.email_id = e.id
                        AND (t.prossimo_tentativo > now()
                             OR (coalesce(t.ultimo_esito, '') <> 'credito' AND t.tentativi >= 6)))
    ORDER BY e.received_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit,5), 15))
  LOOP
    PERFORM net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-ai-estrai-allegato',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', p_cron_secret),
      body := jsonb_build_object('email_id', rec.id, 'attachment_index', 0),
      timeout_milliseconds := 120000);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('dispatched', v_n);
END $function$;
