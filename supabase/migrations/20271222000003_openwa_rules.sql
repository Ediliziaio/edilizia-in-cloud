-- WhatsApp Locale (OpenWA) — motore REGOLE per numero.
-- Quando arriva un messaggio, le regole abilitate (del numero + globali) vengono
-- valutate in ordine di priorità ed eseguite: auto-risposta, tag/assegnazione,
-- notifica email, blocco/ignora.

CREATE TABLE IF NOT EXISTS public.openwa_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL DEFAULT 'Nuova regola',
  enabled           boolean NOT NULL DEFAULT true,
  priority          integer NOT NULL DEFAULT 100,   -- più basso = valutata prima
  -- Ambito: numero specifico oppure NULL = vale per tutti i numeri.
  number_id         uuid REFERENCES public.openwa_numbers(id) ON DELETE CASCADE,

  -- Trigger sul testo in arrivo.
  match_type        text NOT NULL DEFAULT 'contains', -- any | contains | equals | starts_with
  match_keywords    text[] NOT NULL DEFAULT '{}',     -- parole/frasi (OR); ignorato se match_type='any'
  only_first_contact boolean NOT NULL DEFAULT false,  -- scatta solo al 1° messaggio da quel numero
  only_outside_hours boolean NOT NULL DEFAULT false,  -- scatta solo fuori dalla finestra oraria

  -- Azioni (tutte opzionali, cumulabili).
  reply_text        text,          -- auto-risposta (supporta spintax {a|b}); NULL = nessuna risposta
  add_tags          text[] NOT NULL DEFAULT '{}',  -- tag da aggiungere al contatto
  assign_to         uuid,          -- profiles.id del venditore a cui assegnare il contatto
  notify_email      text,          -- email a cui notificare il match
  block             boolean NOT NULL DEFAULT false, -- true = ferma le altre azioni/regole (spam/ignora)

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT openwa_rules_match_type_chk CHECK (match_type IN ('any','contains','equals','starts_with'))
);

CREATE INDEX IF NOT EXISTS openwa_rules_lookup_idx
  ON public.openwa_rules (enabled, priority) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS openwa_rules_number_idx
  ON public.openwa_rules (number_id);

DROP TRIGGER IF EXISTS trg_openwa_rules_updated ON public.openwa_rules;
CREATE TRIGGER trg_openwa_rules_updated BEFORE UPDATE ON public.openwa_rules
  FOR EACH ROW EXECUTE FUNCTION public.openwa_set_updated_at();

-- RLS: super_admin (console) + service_role (webhook). Nessun accesso tenant.
ALTER TABLE public.openwa_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS openwa_rules_super ON public.openwa_rules;
CREATE POLICY openwa_rules_super ON public.openwa_rules
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS openwa_rules_service ON public.openwa_rules;
CREATE POLICY openwa_rules_service ON public.openwa_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);
